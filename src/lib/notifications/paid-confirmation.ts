import { formatINR } from "@/lib/utils/money";
import { cldUrl } from "@/lib/images/cloudinary-url";
import {
  esc,
  type EmailTemplateIds,
  type EmailTemplateRef,
} from "@/lib/email/templates";

// Re-exported so the existing call sites/tests keep one canonical escaper.
export { esc };

/**
 * Pure core for the paid-order confirmation email.
 *
 * Everything here is deterministic and dependency-free (like
 * `@/lib/payments/pay-inline-core`): the database and Resend arrive as injected
 * dependencies, so the delivery state machine, the content builders, and the
 * "at most one automatic send" contract can all be exercised without a database
 * or a network.
 *
 * The money rule: a confirmation is only ever built for an order whose
 * `paymentStatus` is PAID. The exact amount shown is passed in as
 * `paidAmount` — the caller derives it from the verified `Payment` rows, never
 * from the client.
 */

/** The `Order.type` values that receive a paid confirmation (PRODUCT = shop). */
export type PaidConfirmationType = "PRODUCT" | "SERVICE";

/** The order snapshot the builders render. All values are server-side snapshots. */
export type PaidConfirmationOrder = {
  id: string;
  orderNumber: string;
  type: string;
  customerName: string;
  customerEmail: string;
  /** Current `Order.paymentStatus`. Must be PAID to send. */
  paymentStatus: string;
  total: number;
  /** Gross collected from verified payment rows (paise). */
  paidAmount: number;
  /**
   * Authoritative money breakdown (paise), when the adapter supplies it. All are
   * optional so a caller that only has `total` still renders correctly; the
   * builders fall back to the item line totals.
   */
  subtotal?: number;
  shipping?: number;
  discount?: number;
  tax?: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    /**
     * Cloudinary delivery URL snapshot captured at checkout. Absolute HTTPS
     * only; anything else is omitted from the email (never fetched here).
     */
    imageUrl?: string | null;
  }>;
  services: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  summary: Record<string, unknown> | null;
  shippingMode: string | null;
  shippingAddress: {
    streetAddress: string;
    city: string;
    state: string;
    postalCode: string;
  } | null;
};

export type EmailMessage = {
  to: string;
  subject: string;
  /**
   * The published Resend template that renders this message together with the
   * variables the application has already decided.
   */
  template?: EmailTemplateRef;
  html?: string;
};

/**
 * Result of asking the provider to accept a message.
 *
 *   accepted  — Resend returned an email id. The ONLY outcome that may be
 *               recorded as SENT.
 *   rejected  — a definitive 4xx rejection: not accepted, safe to retry.
 *   ambiguous — timeout/network/5xx: may or may not have been accepted. Must
 *               never be auto-retried.
 */
export type SendOutcome =
  | { kind: "accepted"; providerMessageId: string | null }
  | { kind: "rejected"; reason: string }
  | { kind: "ambiguous"; reason: string };

export type PaidConfirmationDeps = {
  /**
   * Atomically create-then-claim the single notification row for this order.
   * Exactly one concurrent caller may receive `{ claimed: true }`.
   */
  claimPending: (
    orderId: string,
  ) => Promise<{
    claimed: boolean;
    notificationId: string | null;
    status: string | null;
  }>;
  markSent: (
    notificationId: string,
    providerMessageId: string | null,
  ) => Promise<void>;
  markFailed: (notificationId: string, reason: string) => Promise<void>;
  markNeedsReview: (notificationId: string, reason: string) => Promise<void>;
  send: (message: EmailMessage) => Promise<SendOutcome>;
};

export type PaidConfirmationResult =
  | {
      status: "skipped";
      reason: "order-not-found" | "not-fully-paid" | "unsupported-order-type" | "no-recipient";
    }
  | { status: "already-claimed"; notificationStatus: string | null }
  | { status: "sent" }
  | { status: "failed"; reason: string }
  | { status: "needs-review"; reason: string }
  | { status: "error"; reason: string };

export type PaidConfirmationSkipReason =
  | "not-fully-paid"
  | "unsupported-order-type"
  | "no-recipient";

/**
 * The single sendability predicate, shared by the live send path and the
 * historical reconciliation report so the two can never disagree about which
 * orders should ever receive a confirmation.
 */
export function paidConfirmationSkipReason(
  order: Pick<PaidConfirmationOrder, "paymentStatus" | "type" | "customerEmail">,
): PaidConfirmationSkipReason | null {
  if (order.paymentStatus !== "PAID") return "not-fully-paid";
  if (order.type !== "PRODUCT" && order.type !== "SERVICE") {
    return "unsupported-order-type";
  }
  if (!order.customerEmail) return "no-recipient";
  return null;
}

/** Only a confirmed (definitive) failure is safe to re-queue automatically. */
export function isRetryableNotificationStatus(status: string): boolean {
  return status === "FAILED";
}

/**
 * Whether a manual-payment write should trigger a paid confirmation.
 *
 * A total-price edit recomputes `paymentStatus` but records no payment and must
 * never notify; only an actual payment row that fully settles the order may.
 */
export function shouldNotifyAfterManualPayment(input: {
  recordedAmount: number;
  paymentStatus: string;
}): boolean {
  return input.recordedAmount > 0 && input.paymentStatus === "PAID";
}

/**
 * Run one delivery attempt for a paid order.
 *
 * Never throws: a send or persistence failure is captured in the notification
 * row and returned. The caller must treat this as strictly best-effort — the
 * payment is already settled.
 */
export async function runPaidConfirmation(
  deps: PaidConfirmationDeps,
  order: PaidConfirmationOrder,
  templates: EmailTemplateIds = {},
  options: PaidConfirmationEmailOptions = {},
): Promise<PaidConfirmationResult> {
  const skip = paidConfirmationSkipReason(order);
  if (skip) {
    return { status: "skipped", reason: skip };
  }

  const claim = await deps.claimPending(order.id);
  if (!claim.claimed || !claim.notificationId) {
    return { status: "already-claimed", notificationStatus: claim.status };
  }

  let outcome: SendOutcome;
  try {
    outcome = await deps.send(buildPaidConfirmation(order, templates, options));
  } catch {
    // A thrown send is ambiguous by definition: the request may have left the
    // process before it failed. Never retry it automatically.
    outcome = { kind: "ambiguous", reason: "resend:threw" };
  }

  if (outcome.kind === "accepted") {
    await deps
      .markSent(claim.notificationId, outcome.providerMessageId)
      .catch(() => {});
    return { status: "sent" };
  }
  if (outcome.kind === "rejected") {
    await deps.markFailed(claim.notificationId, outcome.reason).catch(() => {});
    return { status: "failed", reason: outcome.reason };
  }
  await deps
    .markNeedsReview(claim.notificationId, outcome.reason)
    .catch(() => {});
  return { status: "needs-review", reason: outcome.reason };
}

/**
 * Optional rendering context for the paid-confirmation emails. Kept separate
 * from the order snapshot: the same order renders identically in tests and prod,
 * only the absolute origin of the CTA changes.
 */
export type PaidConfirmationEmailOptions = {
  /** Absolute site origin (no trailing slash) used for the header link and CTA. */
  siteUrl?: string;
};

/** Brand tokens used by the pre-rendered variable fragments. */
const BRAND = {
  ink: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  font: "Arial,Helvetica,sans-serif",
} as const;

const DEFAULT_SITE_URL = "https://keebforge.in";

/**
 * Hard per-variable ceiling enforced by Resend's `/emails` API: every pre-
 * rendered `*Html` fragment is bounded below this (see `boundedFragments`), so
 * a large cart or a fully-populated mods config can never break a real paid
 * confirmation with a 422 `template, variables, value` rejection.
 */
export const RESEND_TEMPLATE_VARIABLE_MAX = 2000;

function fits(value: string): boolean {
  return value.length <= RESEND_TEMPLATE_VARIABLE_MAX;
}

/** Email thumbnail width — small payload, never the full-resolution asset. */
const EMAIL_THUMB_WIDTH = 120;

function resolveSiteUrl(override?: string): string {
  const raw = (override ?? process.env.NEXT_PUBLIC_APP_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  return /^https?:\/\//i.test(raw) ? raw : DEFAULT_SITE_URL;
}

/** The public, secret-free tracking URL — the only safe "view order" link. */
function orderTrackingUrl(siteUrl: string, orderNumber: string): string {
  return `${siteUrl}/track-order?order=${encodeURIComponent(orderNumber)}`;
}

/**
 * A small, absolute-HTTPS thumbnail URL for an order item, or null.
 *
 * Only pre-existing Cloudinary delivery URLs are used — nothing is uploaded or
 * minted here, and no credentials are ever placed in the markup. A non-HTTPS or
 * missing URL is omitted so a bad image can never break the send.
 */
function emailThumbnail(
  imageUrl: string | null | undefined,
  width = EMAIL_THUMB_WIDTH,
): string | null {
  const raw = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (!/^https:\/\//i.test(raw)) return null;
  const transformed = cldUrl(raw, width);
  return /^https:\/\//i.test(transformed) ? transformed : null;
}

/** Pick the right builder for the order type. */
export function buildPaidConfirmation(
  order: PaidConfirmationOrder,
  templates: EmailTemplateIds = {},
  options: PaidConfirmationEmailOptions = {},
): EmailMessage {
  return order.type === "SERVICE"
    ? buildModsPaidConfirmation(order, templates, options)
    : buildShopPaidConfirmation(order, templates, options);
}

export function buildShopPaidConfirmation(
  order: PaidConfirmationOrder,
  templates: EmailTemplateIds = {},
  options: PaidConfirmationEmailOptions = {},
): EmailMessage {
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const amountPaid = order.paidAmount > 0 ? order.paidAmount : order.total;
  const subtotal =
    order.subtotal ?? order.items.reduce((sum, item) => sum + item.lineTotal, 0);
  const shipping = order.shipping ?? Math.max(0, order.total - subtotal);
  const discount = order.discount ?? 0;
  const orderUrl = orderTrackingUrl(siteUrl, order.orderNumber);

  const itemsHtml = itemsListTable(order.items);

  const totals: Array<[string, string, boolean?]> = [
    ["Subtotal", formatINR(subtotal)],
    ["Shipping", shipping > 0 ? formatINR(shipping) : "Free"],
  ];
  if (discount > 0) totals.push(["Discount", `-${formatINR(discount)}`]);
  totals.push(["Total paid", formatINR(amountPaid), true]);

  const variables = {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    itemsHtml,
    totalsHtml: totalsTable(totals),
    shippingName: order.customerName.trim() || "Customer",
    shippingAddress: formatAddress(order.shippingAddress),
    orderUrl,
  };
  const inlineHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid #e4e4e7">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-weight:700;font-size:16px">KeebForge.in</div>
        <div style="margin-left:auto;color:#71717a;font-size:14px">ORDER #${esc(order.orderNumber)}</div>
      </div>
    </div>
    <div style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px">Thank you for your order!</h1>
      <p style="margin:0 0 16px;color:#71717a">Your payment has been confirmed.</p>
      ${itemsHtml}
      ${totalsTable(totals)}
      <p style="margin-top:20px"><a href="${orderUrl}" style="display:inline-block;padding:12px 20px;background:#a3e635;color:#0a0a0a;text-decoration:none;border-radius:8px;font-weight:600">View your order</a></p>
    </div>
  </div>
</body></html>`;
  return {
    to: order.customerEmail,
    subject: `Order ${order.orderNumber} — Payment Confirmed | KeebForge.in`,
    template: templates.shopOrderPaid
      ? {
          id: templates.shopOrderPaid,
          variables,
        }
      : undefined,
  };
}

export function buildModsPaidConfirmation(
  order: PaidConfirmationOrder,
  templates: EmailTemplateIds = {},
  options: PaidConfirmationEmailOptions = {},
): EmailMessage {
  const siteUrl = resolveSiteUrl(options.siteUrl);
  const amountPaid = order.paidAmount > 0 ? order.paidAmount : order.total;
  const s = order.summary ?? {};

  const configRows: Array<[string, string]> = [];
  const device = joinNonEmpty([str(s.brand), str(s.model)]);
  if (device) configRows.push(["Device", device]);
  const layout = str(s.layout);
  if (layout) configRows.push(["Layout", layout]);
  const switchModel = str(s.switchModel);
  if (switchModel) configRows.push(["Switches", switchModel]);
  if (typeof s.switchQuantity === "number") {
    configRows.push(["Switch quantity", String(s.switchQuantity)]);
  }
  if (typeof s.stabilizerQuantity === "number") {
    configRows.push(["Stabilizers", String(s.stabilizerQuantity)]);
  }
  if (typeof s.keycapsIncluded === "boolean") {
    configRows.push(["Keycaps included", s.keycapsIncluded ? "Yes" : "No"]);
  }

  const method = modsShippingMethodLabel(
    asRecord(s.modsShipping)?.method,
    order.shippingMode,
  );
  const address = formatAddress(order.shippingAddress);
  const orderUrl = orderTrackingUrl(siteUrl, order.orderNumber);

  const configHtml = keyValueTable(
    configRows.length > 0
      ? configRows
      : [["Configuration", "Saved with your order"]],
  );
  const servicesHtml = servicesListTable(order.services);

  const mvars = {
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    amountPaid: formatINR(amountPaid),
    configHtml,
    servicesHtml,
    shippingMethod: method,
    shippingAddress: address,
    orderUrl,
  };
  const minline = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#18181b">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden">
    <div style="padding:20px 24px;border-bottom:1px solid #e4e4e7">
      <div style="font-weight:700;font-size:16px">KeebForge.in</div>
      <div style="color:#71717a;font-size:14px">MODS ORDER #${esc(order.orderNumber)}</div>
    </div>
    <div style="padding:24px">
      <h1 style="margin:0 0 12px;font-size:20px">Payment confirmed</h1>
      ${configHtml}
      ${servicesHtml}
      <div style="margin-top:16px">${totalsTable([["Total paid", formatINR(amountPaid), true]])}</div>
      <p style="margin-top:20px"><a href="${orderUrl}" style="display:inline-block;padding:12px 20px;background:#a3e635;color:#0a0a0a;text-decoration:none;border-radius:8px;font-weight:600">View your order</a></p>
    </div>
  </div>
</body></html>`;
  return {
    to: order.customerEmail,
    subject: `Payment received — mods order ${order.orderNumber}`,
    template: templates.modsOrderPaid
      ? {
          id: templates.modsOrderPaid,
          variables: mvars,
        }
      : undefined,
  };
}

// ── Fragment helpers (table-based, inline styles, no external CSS) ───────────
// The document shell, static copy and buttons live in the Resend template; these
// only pre-render the list-shaped variables Resend cannot loop over.
//
// Since Resend rejects `template, variables, value` fields beyond 2,000 chars,
// every fragment is rendered full-fidelity first, then progressively pared down
// until it fits `RESEND_TEMPLATE_VARIABLE_MAX`. The degradation ladder keeps
// every item/service name and its amount in every rung, so a huge order never
// loses data — only styling.

function wrapTable(inner: string, extraStyle = ""): string {
  return (
    `<table role="presentation" style="width:100%;border-collapse:collapse;font-family:${BRAND.font};${extraStyle}">` +
    inner +
    `</table>`
  );
}

/**
 * Pick the richest fragment that still fits Resend's per-variable size cap.
 * `lastResortHtml` is already returned whole (it is the compact single-line
 * form and is bounded by construction).
 */
function boundedFragments(
  styledRowsHtml: string,
  compactRowsHtml: string,
  lastResortHtml: string,
  extraStyle = "",
): string {
  const full = wrapTable(styledRowsHtml, extraStyle);
  if (fits(full)) return full;
  const slim = wrapTable(compactRowsHtml, extraStyle);
  if (fits(slim)) return slim;
  return lastResortHtml;
}

type OrderLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl?: string | null;
};

const ROW_BORDER = `border-top:1px solid ${BRAND.border};`;
const ROW_PAD = `padding:12px 0;${ROW_BORDER}`;

function itemRow(item: OrderLine): string {
  const thumb = emailThumbnail(item.imageUrl);
  const mediaCell = thumb
    ? `<td width="76" valign="middle" style="${ROW_PAD}">` +
      `<img src="${esc(thumb)}" width="64" height="64" alt="${esc(item.name)}" style="display:block;width:64px;height:64px;border:1px solid ${BRAND.border};border-radius:8px;object-fit:cover;" />` +
      `</td>`
    : "";
  const padLeft = thumb ? "padding-left:12px;" : "";
  return (
    `<tr>` +
    mediaCell +
    `<td valign="middle" style="${ROW_PAD}${padLeft}">` +
    `<div style="font-size:15px;font-weight:600;color:${BRAND.ink};line-height:1.4;">${esc(item.name)}</div>` +
    `<div style="font-size:13px;color:${BRAND.muted};line-height:1.5;margin-top:3px;">× ${item.quantity} · ${esc(formatINR(item.unitPrice))} each</div>` +
    `</td>` +
    `<td valign="middle" align="right" style="${ROW_PAD}white-space:nowrap;font-size:15px;font-weight:600;color:${BRAND.ink};">${esc(formatINR(item.lineTotal))}</td>` +
    `</tr>`
  );
}

function itemCompactRow(item: OrderLine): string {
  return (
    `<tr><td style="padding:6px 0">${esc(item.name)} × ${item.quantity}</td>` +
    `<td align="right" style="padding:6px 0;white-space:nowrap">${esc(formatINR(item.lineTotal))}</td></tr>`
  );
}

/**
 * Last degradation rung: every line in one table cell, `<br>`-separated. Each
 * line is already escaped by the caller.
 */
function lastResortCell(lines: string[]): string {
  return wrapTable(
    `<tr><td style="padding:8px 0">${lines.join("<br>")}</td></tr>`,
    "font-size:14px",
  );
}

function itemsLastResort(items: OrderLine[]): string {
  return lastResortCell(
    items.map(
      (item) =>
        `${esc(item.name)} × ${item.quantity} — ${esc(formatINR(item.lineTotal))}`,
    ),
  );
}

function itemsListTable(items: OrderLine[]): string {
  if (items.length === 0) return emptyRow("Your order items");
  return boundedFragments(
    items.map(itemRow).join(""),
    items.map(itemCompactRow).join(""),
    itemsLastResort(items),
  );
}

function serviceRow(service: {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}): string {
  return (
    `<tr>` +
    `<td valign="middle" style="${ROW_PAD}">` +
    `<div style="font-size:15px;font-weight:600;color:${BRAND.ink};line-height:1.4;">${esc(service.name)} × ${service.quantity}</div>` +
    `<div style="font-size:13px;color:${BRAND.muted};line-height:1.5;margin-top:3px;">${esc(formatINR(service.unitPrice))} each</div>` +
    `</td>` +
    `<td valign="middle" align="right" style="${ROW_PAD}white-space:nowrap;font-size:15px;font-weight:600;color:${BRAND.ink};">${esc(formatINR(service.lineTotal))}</td>` +
    `</tr>`
  );
}

function serviceCompactRow(service: {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}): string {
  return (
    `<tr><td style="padding:6px 0">${esc(service.name)} × ${service.quantity}</td>` +
    `<td align="right" style="padding:6px 0;white-space:nowrap">${esc(formatINR(service.lineTotal))}</td></tr>`
  );
}

function servicesLastResort(services: Array<{ name: string; quantity: number; lineTotal: number }>): string {
  return lastResortCell(
    services.map(
      (service) =>
        `${esc(service.name)} × ${service.quantity} — ${esc(formatINR(service.lineTotal))}`,
    ),
  );
}

function servicesListTable(services: Array<{ name: string; quantity: number; unitPrice: number; lineTotal: number }>): string {
  if (services.length === 0) {
    return keyValueTable([["Services", "Saved with your order"]]);
  }
  return boundedFragments(
    services.map(serviceRow).join(""),
    services.map(serviceCompactRow).join(""),
    servicesLastResort(services),
  );
}

function emptyRow(text: string): string {
  return (
    `<tr><td style="${ROW_PAD}font-size:14px;color:${BRAND.muted};">${esc(text)}</td></tr>`
  );
}

function keyValueTable(rows: Array<[string, string]>): string {
  if (rows.length === 0) return "";
  const styled = rows
    .map(
      ([key, value]) =>
        `<tr>` +
        `<td style="padding:9px 0;${ROW_BORDER}vertical-align:top;width:150px;font-size:13px;color:${BRAND.muted};">${esc(key)}</td>` +
        `<td style="padding:9px 0;${ROW_BORDER}vertical-align:top;font-size:14px;color:${BRAND.ink};">${esc(value)}</td>` +
        `</tr>`,
    )
    .join("");
  const compact = rows
    .map(
      ([key, value]) =>
        `<tr><td style="padding:5px 0">${esc(key)}</td><td style="padding:5px 0">${esc(value)}</td></tr>`,
    )
    .join("");
  const lastResort = lastResortCell(
    rows.map(([key, value]) => `${esc(key)}: ${esc(value)}`),
  );
  return boundedFragments(styled, compact, lastResort);
}

function totalsTable(rows: Array<[string, string, boolean?]>): string {
  const styled = rows
    .map(([key, value, strong]) => {
      const size = strong ? "16px" : "14px";
      const weight = strong ? "700" : "400";
      const labelColor = strong ? BRAND.ink : BRAND.muted;
      return (
        `<tr>` +
        `<td style="padding:9px 0;${ROW_BORDER}font-size:${size};font-weight:${weight};color:${labelColor};">${esc(key)}</td>` +
        `<td align="right" style="padding:9px 0;${ROW_BORDER}font-size:${size};font-weight:${weight};color:${BRAND.ink};white-space:nowrap;">${esc(value)}</td>` +
        `</tr>`
      );
    })
    .join("");
  const compact = rows
    .map(
      ([key, value]) =>
        `<tr><td style="padding:6px 0">${esc(key)}</td><td align="right" style="padding:6px 0;white-space:nowrap">${esc(value)}</td></tr>`,
    )
    .join("");
  const lastResort = lastResortCell(
    rows.map(([key, value]) => `${esc(key)}: ${esc(value)}`),
  );
  return boundedFragments(styled, compact, lastResort, "margin-top:4px");
}

function formatAddress(address: PaidConfirmationOrder["shippingAddress"]): string {
  if (!address) return "To be confirmed";
  const parts = [
    address.streetAddress,
    address.city,
    [address.state, address.postalCode].filter(Boolean).join(" "),
  ].filter((part) => part.length > 0);
  return parts.length > 0 ? parts.join(", ") : "To be confirmed";
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function joinNonEmpty(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join(" ");
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function modsShippingMethodLabel(
  method: unknown,
  mode: string | null,
): string {
  const base =
    method === "customer_shipping"
      ? "You ship your device to KeebForge"
      : method === "pickup"
        ? "KeebForge arranges pickup"
        : method === "undecided"
          ? "To be decided"
          : "To be confirmed";
  const modeLabel =
    mode === "surface" ? " (Surface)" : mode === "express" ? " (Express)" : "";
  return base + modeLabel;
}

/* -------------------------------------------------------------------------- */
/* Notification recovery (M3) and historical reconciliation (M1)              */
/* -------------------------------------------------------------------------- */

/** The subset of a notification row the recovery planner needs. */
export type NotificationRecoveryRecord = {
  status: string;
  attempts: number;
  claimedAt: Date | null;
  sentAt: Date | null;
  providerMessageId: string | null;
  lastError: string | null;
  updatedAt: Date;
};

/**
 * Classification of a notification row's recoverability. Kept explicit so the
 * operator path and its tests reason about the same taxonomy:
 *
 * - `pending`                      — never attempted, or reset for an explicit resend.
 * - `already-sent`                 — terminal success; nothing to do.
 * - `retryable`                    — a definitive provider rejection (FAILED).
 * - `in-flight`                    — claimed recently; leave it alone.
 * - `ambiguous-stale-in-flight`    — claimed but abandoned; needs a human.
 * - `ambiguous`                    — NEEDS_REVIEW or an unknown status.
 */
export type NotificationRecoveryPlan =
  | { kind: "no-record" }
  | { kind: "pending" }
  | { kind: "already-sent"; providerMessageId: string | null }
  | { kind: "retryable"; reason: string | null }
  | { kind: "in-flight"; ageMs: number }
  | { kind: "ambiguous-stale-in-flight"; ageMs: number }
  | { kind: "ambiguous"; reason: string | null };

export function planNotificationRecovery(
  record: NotificationRecoveryRecord | null,
  opts: { now: Date; staleAfterMs: number },
): NotificationRecoveryPlan {
  if (!record) return { kind: "no-record" };

  switch (record.status) {
    case "PENDING":
      return { kind: "pending" };
    case "SENT":
      return { kind: "already-sent", providerMessageId: record.providerMessageId };
    case "FAILED":
      return { kind: "retryable", reason: record.lastError };
    case "NEEDS_REVIEW":
      return { kind: "ambiguous", reason: record.lastError };
    case "IN_PROGRESS": {
      const since = record.claimedAt ?? record.updatedAt;
      const ageMs = Math.max(0, opts.now.getTime() - since.getTime());
      return ageMs >= opts.staleAfterMs
        ? { kind: "ambiguous-stale-in-flight", ageMs }
        : { kind: "in-flight", ageMs };
    }
    default:
      return { kind: "ambiguous", reason: `unknown-status:${record.status}` };
  }
}

export type NotificationReviewDecision =
  | "confirmed-not-accepted"
  | "confirmed-accepted";

export type ReconciliationTransition =
  | { action: "reset-to-pending" }
  | { action: "mark-sent" }
  | { action: "refuse"; reason: string };

/**
 * Decide what an operator's reconciliation may do. Only an *ambiguous* record
 * (NEEDS_REVIEW, stale IN_PROGRESS, or unknown) can be reconciled, and only
 * with an explicit `confirm`. Defined failures use the definite retry path and
 * healthy states are left untouched, so this can never blindly reset/resend.
 */
export function planReconciliationTransition(
  plan: NotificationRecoveryPlan,
  decision: NotificationReviewDecision,
  confirm: boolean,
): ReconciliationTransition {
  if (!confirm) return { action: "refuse", reason: "confirmation-required" };
  const ambiguous =
    plan.kind === "ambiguous" || plan.kind === "ambiguous-stale-in-flight";
  if (!ambiguous) return { action: "refuse", reason: `not-ambiguous:${plan.kind}` };
  return decision === "confirmed-accepted"
    ? { action: "mark-sent" }
    : { action: "reset-to-pending" };
}

/** A PAID order that currently has no confirmation row (candidate to backfill). */
export type ReconcileCandidate = {
  id: string;
  orderNumber: string;
  type: string;
  paymentStatus: string;
  customerEmail: string;
};

export type ReconciliationDeps = {
  listMissing: (input: {
    orderIds: string[] | null;
    /**
     * When set, only orders created on or after this instant are considered.
     * Used by the scheduled backfill so the historical backlog is never
     * auto-queued; manual reconciliation leaves it null (explicit selection).
     */
    since: Date | null;
    /**
     * When true, the adapter may pre-filter at the database to the sendable
     * shape. The pure `paidConfirmationSkipReason` gate below remains the
     * authority; this is only a bounded-query optimisation.
     */
    eligibleOnly: boolean;
    limit: number;
  }) => Promise<ReconcileCandidate[]>;
  queue: (orderId: string) => Promise<"created" | "exists">;
};

export type ReconciliationRow = {
  orderId: string;
  orderNumber: string;
  action: "would-queue" | "queued" | "already-present" | "skipped-ineligible";
  reason?: string;
};

export type ReconciliationReport = {
  dryRun: boolean;
  examined: number;
  queued: number;
  alreadyPresent: number;
  skipped: number;
  rows: ReconciliationRow[];
};

/**
 * Backfill the crash window between a committed payment and its post-commit
 * notification row. This only ever *creates* missing PENDING rows; it never
 * sends. Applying is impossible without an explicit `orderIds` selection, so a
 * historical backlog can only be queued deliberately, order by order.
 */
export async function reconcilePaidConfirmations(
  deps: ReconciliationDeps,
  input: { orderIds?: string[]; dryRun?: boolean; limit?: number },
): Promise<ReconciliationReport> {
  const dryRun = input.dryRun !== false;
  const orderIds =
    input.orderIds && input.orderIds.length > 0 ? input.orderIds : null;

  if (!dryRun && !orderIds) {
    throw new Error(
      "reconcilePaidConfirmations: apply mode requires an explicit orderIds selection",
    );
  }

  const limit = input.limit ?? 500;
  const candidates = await deps.listMissing({
    orderIds,
    since: null,
    eligibleOnly: false,
    limit,
  });

  const rows: ReconciliationRow[] = [];
  let queued = 0;
  let alreadyPresent = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const skip = paidConfirmationSkipReason(candidate);
    if (skip) {
      skipped += 1;
      rows.push({
        orderId: candidate.id,
        orderNumber: candidate.orderNumber,
        action: "skipped-ineligible",
        reason: skip,
      });
      continue;
    }

    if (dryRun) {
      rows.push({
        orderId: candidate.id,
        orderNumber: candidate.orderNumber,
        action: "would-queue",
      });
      continue;
    }

    const result = await deps.queue(candidate.id);
    if (result === "created") {
      queued += 1;
      rows.push({
        orderId: candidate.id,
        orderNumber: candidate.orderNumber,
        action: "queued",
      });
    } else {
      alreadyPresent += 1;
      rows.push({
        orderId: candidate.id,
        orderNumber: candidate.orderNumber,
        action: "already-present",
      });
    }
  }

  return {
    dryRun,
    examined: candidates.length,
    queued,
    alreadyPresent,
    skipped,
    rows,
  };
}

/* -------------------------------------------------------------------------- */
/* Scheduled bounded backfill (Part A)                                        */
/* -------------------------------------------------------------------------- */

/**
 * Hard ceiling on how many notification rows a single scheduled run may create,
 * regardless of any environment override. Keeps one cron invocation bounded.
 */
export const SCHEDULED_RECONCILE_HARD_MAX = 100;

/** Default page size for the bounded database batches. */
export const SCHEDULED_RECONCILE_DEFAULT_BATCH = 50;

export type ScheduledReconcileReport = {
  /** Rows actually created this run (never more than the effective cap). */
  queued: number;
  /** Candidates inspected, including any the sendability gate skipped. */
  scanned: number;
  /** Candidates that failed the shared sendability gate and were not queued. */
  skipped: number;
  /** Number of bounded database batches read. */
  batches: number;
  /**
   * True only when the effective per-run cap was reached *and* at least one
   * eligible candidate remains. A run that queues exactly `max` rows because the
   * backlog happened to end there is not "capped" — there is nothing left to do.
   */
  capped: boolean;
};

/**
 * Bounded automatic backfill of missing PENDING confirmation rows.
 *
 * This is the *only* automatic queueing path. It deliberately has no `send`
 * dependency: it can create missing PENDING rows and nothing else. It never
 * sends an email, never retries or resets an existing row, and never touches
 * payment/order state — delivery remains an explicit operator action.
 *
 * The cutoff (`since`) is mandatory, so the historical backlog can never be
 * auto-queued. Each database read is bounded, the loop advances because queued
 * rows drop out of the "missing" set, and an unproductive batch stops the loop
 * so an adapter that keeps returning the same candidates cannot spin.
 */
export async function queueMissingPaidConfirmations(
  deps: ReconciliationDeps,
  input: { since: Date; max?: number; batchSize?: number },
): Promise<ScheduledReconcileReport> {
  const requestedMax =
    input.max && input.max > 0 ? Math.floor(input.max) : SCHEDULED_RECONCILE_HARD_MAX;
  const max = Math.min(requestedMax, SCHEDULED_RECONCILE_HARD_MAX);
  const batchSize = Math.max(
    1,
    Math.min(
      input.batchSize && input.batchSize > 0
        ? Math.floor(input.batchSize)
        : SCHEDULED_RECONCILE_DEFAULT_BATCH,
      max,
    ),
  );

  let queued = 0;
  let scanned = 0;
  let skipped = 0;
  let batches = 0;
  let capped = false;

  while (queued < max) {
    const remaining = max - queued;
    const pageLimit = Math.min(batchSize, remaining);
    const candidates = await deps.listMissing({
      orderIds: null,
      since: input.since,
      eligibleOnly: true,
      limit: pageLimit,
    });
    batches += 1;
    if (candidates.length === 0) break;

    let createdThisBatch = 0;
    for (const candidate of candidates) {
      if (queued >= max) break;
      scanned += 1;
      const skip = paidConfirmationSkipReason(candidate);
      if (skip) {
        skipped += 1;
        continue;
      }
      const result = await deps.queue(candidate.id);
      if (result === "created") {
        queued += 1;
        createdThisBatch += 1;
      }
    }

    if (queued >= max) {
      // The cap stopped the loop, but that alone does not mean work remains: the
      // backlog may have ended exactly at the cap. One bounded probe decides it,
      // because the create-only queue has already removed everything just
      // queued from the "missing" set.
      const more = await deps.listMissing({
        orderIds: null,
        since: input.since,
        eligibleOnly: true,
        limit: 1,
      });
      capped = more.length > 0;
      break;
    }
    if (candidates.length < pageLimit) break;
    if (createdThisBatch === 0) break;
  }

  return { queued, scanned, skipped, batches, capped };
}
