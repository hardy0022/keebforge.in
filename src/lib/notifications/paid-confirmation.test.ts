import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildModsPaidConfirmation,
  buildPaidConfirmation,
  buildShopPaidConfirmation,
  esc,
  isRetryableNotificationStatus,
  paidConfirmationSkipReason,
  planNotificationRecovery,
  planReconciliationTransition,
  reconcilePaidConfirmations,
  runPaidConfirmation,
  shouldNotifyAfterManualPayment,
  type NotificationRecoveryPlan,
  type NotificationRecoveryRecord,
  type EmailMessage,
  type PaidConfirmationDeps,
  type PaidConfirmationOrder,
  type ReconciliationDeps,
  type SendOutcome,
  RESEND_TEMPLATE_VARIABLE_MAX,
} from "@/lib/notifications/paid-confirmation";
import {
  classifyResendApiError,
  resendErrorDiagnostic,
} from "@/lib/notifications/resend-diagnostics";
import { allowedNavHrefs } from "@/lib/auth/roles";

/**
 * Paid-order confirmation core.
 *
 * The guarantees being pinned:
 *   1. Content renders ONLY from server-side order snapshots — never from
 *      client input — and every customer-typed value is HTML-escaped.
 *   2. A full payment is the only event that may send; partial captures,
 *      failures, repairs and non-unique types are skipped before any claim.
 *   3. At most one automatic send per order: exactly one claimant wins the
 *      atomic PENDING claim, even under concurrency.
 *   4. Only a Resend `accepted` result is recorded as SENT. Definitive 4xx
 *      rejections go to FAILED (retryable); ambiguous outcomes (timeout /
 *      network / 5xx / throw) go to NEEDS_REVIEW (never auto-retried).
 *   5. Delivery never throws and never touches payment state.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const REPO = path.resolve(import.meta.dirname, "..", "..", "..");

void (async () => {

const shopOrder: PaidConfirmationOrder = {
  id: "order_1",
  orderNumber: "KF-2026-000123",
  type: "PRODUCT",
  customerName: "Aditi  <script>alert(1)</script>",
  customerEmail: "aditi@example.com",
  paymentStatus: "PAID",
  total: 100000,
  paidAmount: 100000,
  items: [
    {
      name: "Hot-swap TKL <img src=x onerror=alert(1)>",
      quantity: 2,
      unitPrice: 50000,
      lineTotal: 100000,
    },
  ],
  services: [],
  summary: null,
  shippingMode: null,
  shippingAddress: null,
};

const modsOrder: PaidConfirmationOrder = {
  id: "order_2",
  orderNumber: "KF-2026-000456",
  type: "SERVICE",
  customerName: "Rahul Dev",
  customerEmail: "rahul@example.com",
  paymentStatus: "PAID",
  total: 24500,
  paidAmount: 24500,
  items: [],
  services: [
    {
      name: "Gasket mount install",
      quantity: 1,
      unitPrice: 10000,
      lineTotal: 10000,
    },
    {
      name: "Lubing (factory)",
      quantity: 70,
      unitPrice: 150,
      lineTotal: 10500,
    },
  ],
  summary: {
    deviceType: "KEYBOARD",
    brand: "Wooting",
    model: "60HE <b>",
    layout: "60%",
    switchModel: "Lekker Magnetic",
    switchQuantity: 61,
    stabilizerQuantity: 4,
    keycapsIncluded: true,
    modsShipping: { method: "customer_shipping", mode: "express" },
  },
  shippingMode: "express",
  shippingAddress: {
    streetAddress: "Flat 4B, Lake View",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
  },
};

/** In-memory stand-in for the (orderId, type) unique + PENDING-only claim. */
function fakeDeps(send: (message: EmailMessage) => Promise<SendOutcome>) {
  const statusStore = new Map<string, string>();
  const mark: Array<string> = [];
  const deps: PaidConfirmationDeps = {
    claimPending: async (orderId) => {
      const current = statusStore.get(orderId) ?? "PENDING";
      if (current !== "PENDING") {
        return { claimed: false, notificationId: `n:${orderId}`, status: current };
      }
      statusStore.set(orderId, "IN_PROGRESS");
      return { claimed: true, notificationId: `n:${orderId}`, status: "IN_PROGRESS" };
    },
    markSent: async (id, providerMessageId) => {
      mark.push(`SENT:${id}:${providerMessageId ?? ""}`);
      statusStore.set(id.slice(2), "SENT");
    },
    markFailed: async (id, reason) => {
      mark.push(`FAILED:${id}:${reason}`);
      statusStore.set(id.slice(2), "FAILED");
    },
    markNeedsReview: async (id, reason) => {
      mark.push(`NEEDS_REVIEW:${id}:${reason}`);
      statusStore.set(id.slice(2), "NEEDS_REVIEW");
    },
    send,
  };
  return { deps, statusStore, mark };
}

// ── Escaping and safety ─────────────────────────────────────────────────────

{
  const html = esc(`<script>alert("x")&<'</script>`);
  assert.equal(html.includes("<script>"), false);
  assert.equal(html.includes("<img src=x onerror=alert(1)>"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
  pass("esc neutralises every HTML metacharacter");
}

// ── Shop content ────────────────────────────────────────────────────────────

{
  assert.deepEqual(
    buildPaidConfirmation(shopOrder, { shopOrderPaid: "tpl_shop" }),
    buildShopPaidConfirmation(shopOrder, { shopOrderPaid: "tpl_shop" }),
  );
  assert.deepEqual(
    buildPaidConfirmation(modsOrder, { modsOrderPaid: "tpl_mods" }),
    buildModsPaidConfirmation(modsOrder, { modsOrderPaid: "tpl_mods" }),
  );
  pass("buildPaidConfirmation dispatches to the shop vs mods builder");
}

{
  // No template id configured: the message still names the recipient and
  // subject, but carries no template — the sender turns that into a definitive
  // "template:not-configured" failure rather than falling back to inline HTML.
  const bare = buildShopPaidConfirmation(shopOrder);
  assert.equal(bare.template, undefined);
  assert.equal(bare.to, shopOrder.customerEmail);
  assert.equal(bare.subject, "Order KF-2026-000123 — Payment Confirmed | KeebForge.in");
  pass("shop confirmation without a template id carries no template");
}

{
  const mail = buildShopPaidConfirmation(shopOrder, { shopOrderPaid: "tpl_shop" });
  assert.equal(mail.subject, "Order KF-2026-000123 — Payment Confirmed | KeebForge.in");
  assert.equal(mail.to, shopOrder.customerEmail);
  assert.equal(mail.template?.id, "tpl_shop");
  const v = mail.template?.variables ?? {};
  const itemsHtml = String(v.itemsHtml);
  assert.ok(itemsHtml.includes("Hot-swap TKL"), "item name is rendered");
  assert.ok(itemsHtml.includes("× 2"), "quantity is rendered");
  assert.ok(String(v.totalsHtml).includes("₹1,000"), "line total is rendered");
  assert.equal(v.orderUrl, "https://keebforge.in/track-order?order=KF-2026-000123");
  // Customer-typed content is escaped in the pre-rendered fragment, never raw.
  assert.equal(itemsHtml.includes("<img src=x onerror=alert(1)>"), false);
  assert.equal(itemsHtml.includes("&lt;img src=x onerror=alert(1)&gt;"), true);
  pass("shop confirmation renders authoritative order data and escapes input");
}

{
  // Amount is derived from verified payment records (paidAmount), which here
  // disagrees with `total` to prove which one is shown.
  const paidLower = buildShopPaidConfirmation(
    { ...shopOrder, paidAmount: 95000 },
    { shopOrderPaid: "tpl_shop" },
  );
  assert.ok(
    String(paidLower.template?.variables.totalsHtml).includes("₹950"),
    "shows the verified paid amount",
  );
  pass("shop confirmation shows verified paid amount, not the order total");
}

{
  // Resend cannot loop, so the list-shaped content is pre-rendered into
  // table-based fragments the template drops in verbatim.
  const v = buildShopPaidConfirmation(shopOrder, { shopOrderPaid: "tpl_shop" })
    .template?.variables ?? {};
  assert.ok(String(v.itemsHtml).includes("<tr>"), "items fragment renders rows");
  assert.ok(
    /<table[^>]*role="presentation"/.test(String(v.totalsHtml)),
    "totals use layout tables",
  );
  assert.ok(String(v.totalsHtml).includes("Total paid"), "totals carry the headline");
  pass("shop confirmation pre-renders table-based variable fragments");
}

{
  // A stored Cloudinary delivery URL gets a small, email-safe transform.
  const imageUrl =
    "https://res.cloudinary.com/keebforge/image/upload/v123/products/board.jpg";
  const withImage = buildShopPaidConfirmation(
    { ...shopOrder, items: [{ ...shopOrder.items[0], imageUrl }] },
    { shopOrderPaid: "tpl_shop" },
  );
  const itemsHtml = String(withImage.template?.variables.itemsHtml);
  assert.ok(
    itemsHtml.includes(
      "https://res.cloudinary.com/keebforge/image/upload/f_auto,q_auto,c_limit,w_120/v123/products/board.jpg",
    ),
    "item image is transformed for email",
  );
  assert.ok(itemsHtml.includes("<img "), "thumbnail is rendered");
  pass("shop confirmation thumbnails a stored Cloudinary image");
}

{
  // Anything that is not an absolute HTTPS URL is dropped, never rendered — a
  // bad image must never break the send and http:// must never leak into mail.
  for (const imageUrl of [
    null,
    "",
    "http://insecure.example/x.jpg",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
  ]) {
    const mail = buildShopPaidConfirmation(
      { ...shopOrder, items: [{ ...shopOrder.items[0], imageUrl }] },
      { shopOrderPaid: "tpl_shop" },
    );
    assert.equal(
      String(mail.template?.variables.itemsHtml).includes("<img "),
      false,
      `no <img> for unsupported image: ${String(imageUrl)}`,
    );
  }
  pass("shop confirmation omits unsupported item images");
}

{
  // A non-Cloudinary absolute HTTPS URL is allowed as-is (cldUrl is a no-op).
  const mail = buildShopPaidConfirmation(
    {
      ...shopOrder,
      items: [
        { ...shopOrder.items[0], imageUrl: "https://cdn.example.com/p.jpg" },
      ],
    },
    { shopOrderPaid: "tpl_shop" },
  );
  assert.ok(String(mail.template?.variables.itemsHtml).includes("https://cdn.example.com/p.jpg"));
  pass("shop confirmation keeps an absolute HTTPS image untouched");
}

{
  // Money breakdown comes from the order snapshot; the headline figure is the
  // verified settled amount, and the discount is shown as a negative line.
  const mail = buildShopPaidConfirmation(
    {
      ...shopOrder,
      subtotal: 100000,
      shipping: 4900,
      discount: 5000,
      tax: 0,
      total: 99900,
      paidAmount: 99900,
    },
    { shopOrderPaid: "tpl_shop" },
  );
  const totalsHtml = String(mail.template?.variables.totalsHtml);
  for (const needle of ["₹1,000", "₹49", "-₹50", "₹999"]) {
    assert.ok(totalsHtml.includes(needle), `totals should contain ${needle}`);
  }
  pass("shop confirmation itemises subtotal, shipping, discount and total");
}

{
  // The CTA target is derived from the (validated) site origin + order number,
  // never from anything the client supplied at checkout.
  const fallback = buildShopPaidConfirmation(shopOrder, { shopOrderPaid: "tpl_shop" });
  assert.equal(
    fallback.template?.variables.orderUrl,
    "https://keebforge.in/track-order?order=KF-2026-000123",
    "defaults to the production origin",
  );

  const custom = buildShopPaidConfirmation(
    shopOrder,
    { shopOrderPaid: "tpl_shop" },
    { siteUrl: "https://staging.keebforge.in/" },
  );
  const customUrl = String(custom.template?.variables.orderUrl);
  assert.ok(customUrl.includes("https://staging.keebforge.in/track-order"));
  assert.equal(customUrl.includes("staging.keebforge.in//"), false, "trailing slash trimmed");

  const encoded = buildShopPaidConfirmation(
    { ...shopOrder, orderNumber: "KF 2026/1" },
    { shopOrderPaid: "tpl_shop" },
    { siteUrl: "https://keebforge.in" },
  );
  assert.ok(
    String(encoded.template?.variables.orderUrl).includes("order=KF%202026%2F1"),
    "order number is URL-encoded",
  );
  pass("shop confirmation builds a safe, URL-encoded tracking CTA");
}

{
  // The template path carries the same authoritative values and fragments.
  const mail = buildShopPaidConfirmation(shopOrder, { shopOrderPaid: "tpl_shop" });
  assert.equal(mail.template?.id, "tpl_shop");
  const vars = mail.template?.variables ?? {};
  assert.equal(vars.orderNumber, "KF-2026-000123");
  assert.equal(vars.orderUrl, "https://keebforge.in/track-order?order=KF-2026-000123");
  assert.ok(String(vars.itemsHtml).includes("Hot-swap TKL"));
  assert.ok(String(vars.totalsHtml).includes("Total paid"));
  assert.equal(vars.shippingName, shopOrder.customerName.trim());
  pass("shop confirmation template variables mirror the inline content");
}

// ── Mods content ────────────────────────────────────────────────────────────

{
  const mail = buildModsPaidConfirmation(modsOrder, { modsOrderPaid: "tpl_mods" });
  assert.equal(mail.subject, "Payment received — mods order KF-2026-000456");
  const v = mail.template?.variables ?? {};
  const configHtml = String(v.configHtml);
  const servicesHtml = String(v.servicesHtml);
  for (const needle of [
    "Wooting",
    "60HE",
    "60%",
    "Lekker Magnetic",
    "61",
    "Yes",
  ]) {
    assert.ok(configHtml.includes(needle), `mods config should contain ${needle}`);
  }
  for (const needle of [
    "Gasket mount install × 1",
    "Lubing (factory) × 70",
    "₹100",
  ]) {
    assert.ok(servicesHtml.includes(needle), `mods services should contain ${needle}`);
  }
  assert.equal(
    v.shippingMethod,
    "You ship your device to KeebForge (Express)",
    "shipping method is labelled",
  );
  for (const needle of ["Flat 4B, Lake View", "Bengaluru", "Karnataka", "560001"]) {
    assert.ok(String(v.shippingAddress).includes(needle), `address should contain ${needle}`);
  }
  assert.ok(String(v.amountPaid).includes("₹245"), "amount paid is rendered");
  assert.equal(configHtml.includes("<b>"), false, "model is escaped");
  pass("mods confirmation renders configuration, services, shipping and amount");
}

{
  // Values that were never saved fall back to safe placeholders.
  const minimal = buildModsPaidConfirmation(
    {
      ...modsOrder,
      summary: null,
      services: [],
      shippingAddress: null,
      shippingMode: null,
    },
    { modsOrderPaid: "tpl_mods" },
  );
  const v = minimal.template?.variables ?? {};
  assert.ok(String(v.configHtml).includes("Saved with your order"));
  assert.ok(String(v.servicesHtml).includes("Saved with your order"));
  assert.equal(v.shippingAddress, "To be confirmed");
  pass("mods confirmation uses safe fallbacks for missing saved data");
}

{
  // Services carry no images, so the mods email is image-free by construction.
  const v = buildModsPaidConfirmation(modsOrder, { modsOrderPaid: "tpl_mods" })
    .template?.variables ?? {};
  const servicesHtml = String(v.servicesHtml);
  assert.equal(servicesHtml.includes("<img "), false, "no item images in mods mail");
  assert.ok(/<table[^>]*role="presentation"/.test(servicesHtml), "uses layout tables");
  pass("mods confirmation pre-renders an image-free services fragment");
}

// ── Resend per-variable size cap (2,000 chars) ──────────────────────────────
// Resend rejects `template, variables, value` fields above the limit with a
// 422. Every pre-rendered fragment must stay below it, for realistic and
// worst-case carts/configs alike, while keeping every name and amount.

{
  const manyItems = Array.from({ length: 8 }, (_, i) => ({
    name: `Switch pack ${i + 1} (soldering required)`,
    quantity: i + 1,
    unitPrice: 50000,
    lineTotal: 50000 * (i + 1),
  }));
  const mail = buildShopPaidConfirmation(
    { ...shopOrder, items: manyItems },
    { shopOrderPaid: "tpl_shop" },
  );
  const itemsHtml = String(mail.template?.variables.itemsHtml);
  assert.ok(
    itemsHtml.length <= RESEND_TEMPLATE_VARIABLE_MAX,
    `large shop cart itemsHtml stays under the cap (got ${itemsHtml.length})`,
  );
  for (const item of manyItems) {
    assert.ok(itemsHtml.includes(item.name), "every item name survives");
  }
  pass("shop items fragment is bounded for a large cart");
}

{
  const fullConfig = {
    ...modsOrder,
    services: Array.from({ length: 8 }, (_, i) => ({
      name: `Service line ${i + 1} (desolder + relube)`,
      quantity: i + 1,
      unitPrice: 15000,
      lineTotal: 15000 * (i + 1),
    })),
  };
  const mail = buildModsPaidConfirmation(fullConfig, { modsOrderPaid: "tpl_mods" });
  const v = mail.template?.variables ?? {};
  const configHtml = String(v.configHtml);
  const servicesHtml = String(v.servicesHtml);
  assert.ok(
    configHtml.length <= RESEND_TEMPLATE_VARIABLE_MAX,
    `full mods config stays under the cap (got ${configHtml.length})`,
  );
  assert.ok(
    servicesHtml.length <= RESEND_TEMPLATE_VARIABLE_MAX,
    `large services list stays under the cap (got ${servicesHtml.length})`,
  );
  for (const s of fullConfig.services) {
    assert.ok(servicesHtml.includes(s.name), "every service name survives");
  }
  pass("mods fragments are bounded for a full config and service list");
}

{
  const huge = buildModsPaidConfirmation(
    {
      ...modsOrder,
      services: Array.from({ length: 40 }, (_, i) => ({
        name: `Micro-service ${i + 1}`,
        quantity: 1,
        unitPrice: 10000,
        lineTotal: 10000,
      })),
    },
    { modsOrderPaid: "tpl_mods" },
  );
  const servicesHtml = String(huge.template?.variables.servicesHtml);
  assert.ok(
    servicesHtml.length <= RESEND_TEMPLATE_VARIABLE_MAX,
    `worst-case services list still fits (got ${servicesHtml.length})`,
  );
  for (let i = 1; i <= 40; i += 1) {
    assert.ok(
      servicesHtml.includes(`Micro-service ${i}`),
      `service ${i} survives the degradation ladder`,
    );
  }
  pass("mods services fragment never loses data even at the cap");
}

{
  const mail = buildModsPaidConfirmation(
    modsOrder,
    { modsOrderPaid: "tpl_mods" },
    { siteUrl: "https://staging.keebforge.in" },
  );
  assert.equal(
    mail.template?.variables.orderUrl,
    "https://staging.keebforge.in/track-order?order=KF-2026-000456",
  );
  pass("mods confirmation builds a safe tracking CTA");
}

// ── Skipping rules ──────────────────────────────────────────────────────────

for (const [label, patch, reason] of [
  ["partial payment", { paymentStatus: "PARTIALLY_PAID" }, "not-fully-paid"],
  ["failed payment", { paymentStatus: "FAILED" }, "not-fully-paid"],
  ["unpaid order", { paymentStatus: "PENDING" }, "not-fully-paid"],
] as const) {
  const { deps } = fakeDeps(async () => ({ kind: "accepted", providerMessageId: "re_1" }));
  const seen: string[] = [];
  deps.claimPending = async (id) => {
    seen.push("claim");
    return { claimed: true, notificationId: id, status: "IN_PROGRESS" };
  };
  const result = await runPaidConfirmation(deps, { ...shopOrder, ...patch });
  assert.equal(result.status, "skipped");
  assert.equal((result as { reason: string }).reason, reason);
  assert.deepEqual(seen, [], `${label} must not claim a notification`);
  pass(`${label} produces no confirmation and no claim`);
}

{
  const { deps } = fakeDeps(async () => ({ kind: "accepted", providerMessageId: "re_1" }));
  const result = await runPaidConfirmation(deps, { ...shopOrder, type: "REPAIR", paymentStatus: "PAID" });
  assert.equal(result.status, "skipped");
  assert.equal((result as { reason: string }).reason, "unsupported-order-type");
  pass("non-shop/mods order types never get a paid confirmation");
}

{
  const { deps } = fakeDeps(async () => ({ kind: "accepted", providerMessageId: "re_1" }));
  const result = await runPaidConfirmation(deps, { ...shopOrder, customerEmail: "" });
  assert.equal(result.status, "skipped");
  assert.equal((result as { reason: string }).reason, "no-recipient");
  pass("order without a recipient is skipped");
}

// ── Delivery state machine ──────────────────────────────────────────────────

{
  const { deps, statusStore, mark } = fakeDeps(async () => ({
    kind: "accepted",
    providerMessageId: "re_abc123",
  }));
  const result = await runPaidConfirmation(deps, shopOrder);
  assert.equal(result.status, "sent");
  assert.equal(statusStore.get(shopOrder.id), "SENT");
  assert.deepEqual(mark, [`SENT:n:${shopOrder.id}:re_abc123`]);
  pass("accepted send is recorded as SENT with the provider message id");
}

{
  const { deps, statusStore } = fakeDeps(async () => ({
    kind: "rejected",
    reason: "resend:validation_error:422",
  }));
  const result = await runPaidConfirmation(deps, shopOrder);
  assert.equal(result.status, "failed");
  assert.equal((result as { reason: string }).reason, "resend:validation_error:422");
  assert.equal(statusStore.get(shopOrder.id), "FAILED");
  pass("definitive 4xx rejection records FAILED (safe to retry)");
}

{
  const { deps, statusStore } = fakeDeps(async () => ({
    kind: "ambiguous",
    reason: "resend:internal_server_error:500",
  }));
  const result = await runPaidConfirmation(deps, shopOrder);
  assert.equal(result.status, "needs-review");
  assert.equal(statusStore.get(shopOrder.id), "NEEDS_REVIEW");
  pass("ambiguous outcome records NEEDS_REVIEW (never auto-retried)");
}

{
  const { deps, statusStore } = fakeDeps(async () => {
    throw new Error("socket hang up");
  });
  let result = null;
  try {
    result = await runPaidConfirmation(deps, shopOrder);
  } catch (e) {
    assert.fail(`runPaidConfirmation must not throw (got ${String(e)})`);
  }
  assert.equal(result!.status, "needs-review");
  assert.equal(statusStore.get(shopOrder.id), "NEEDS_REVIEW");
  pass("a thrown send is treated as ambiguous and never propagates");
}

// ── Concurrency: one notification ───────────────────────────────────────────

{
  const { deps, statusStore } = fakeDeps(async (message) => {
    // Yield so both callers race through claim before either finishes.
    await Promise.resolve();
    return { kind: "accepted", providerMessageId: `re_${message.subject.length}` };
  });
  const [a, b] = await Promise.all([
    runPaidConfirmation(deps, shopOrder),
    runPaidConfirmation(deps, shopOrder),
  ]);
  const sent = [a, b].filter((r) => r.status === "sent").length;
  const claimed = [a, b].filter((r) => r.status === "already-claimed").length;
  assert.equal(sent, 1, "exactly one of the racing calls sends");
  assert.equal(claimed, 1, "the other observes the already-claimed state");
  assert.equal(statusStore.get(shopOrder.id), "SENT");
  pass("concurrent verify/webhook settle to exactly one automatic send");
}

// ── Retry eligibility ───────────────────────────────────────────────────────

{
  assert.equal(isRetryableNotificationStatus("FAILED"), true);
  for (const s of ["PENDING", "IN_PROGRESS", "SENT", "NEEDS_REVIEW"]) {
    assert.equal(isRetryableNotificationStatus(s), false, `${s} is not auto-retryable`);
  }
  pass("only confirmed FAILED notifications are retry-elgible");
}

// ── Sendability gate is shared, and manual payments use it ──────────────────

{
  assert.equal(
    paidConfirmationSkipReason({ paymentStatus: "PAID", type: "PRODUCT", customerEmail: "a@b.c" }),
    null,
  );
  assert.equal(
    paidConfirmationSkipReason({ paymentStatus: "PAID", type: "SERVICE", customerEmail: "a@b.c" }),
    null,
    "mods (SERVICE) orders are sendable",
  );
  assert.equal(
    paidConfirmationSkipReason({ paymentStatus: "PARTIALLY_PAID", type: "PRODUCT", customerEmail: "a@b.c" }),
    "not-fully-paid",
  );
  assert.equal(
    paidConfirmationSkipReason({ paymentStatus: "PAID", type: "REPAIR", customerEmail: "a@b.c" }),
    "unsupported-order-type",
  );
  assert.equal(
    paidConfirmationSkipReason({ paymentStatus: "PAID", type: "COMBINED", customerEmail: "a@b.c" }),
    "unsupported-order-type",
    "COMBINED orders are excluded",
  );
  assert.equal(
    paidConfirmationSkipReason({ paymentStatus: "PAID", type: "PRODUCT", customerEmail: "" }),
    "no-recipient",
  );
  pass("the shared sendability gate matches the runPaidConfirmation guard");
}

{
  assert.equal(shouldNotifyAfterManualPayment({ recordedAmount: 5000, paymentStatus: "PAID" }), true);
  assert.equal(
    shouldNotifyAfterManualPayment({ recordedAmount: 5000, paymentStatus: "PARTIALLY_PAID" }),
    false,
    "a partial payment must not notify",
  );
  assert.equal(
    shouldNotifyAfterManualPayment({ recordedAmount: 0, paymentStatus: "PAID" }),
    false,
    "a zero-amount write must not notify",
  );
  pass("admin manual payments notify only when a real payment fully settles");
}

// ── Recovery planner (M3 classification) ────────────────────────────────────

{
  const now = new Date("2026-10-10T12:00:00Z");
  const staleAfterMs = 15 * 60 * 1000;
  const rec = (
    over: Partial<NotificationRecoveryRecord>,
  ): NotificationRecoveryRecord => ({
    status: "PENDING",
    attempts: 1,
    claimedAt: null,
    sentAt: null,
    providerMessageId: null,
    lastError: null,
    updatedAt: now,
    ...over,
  });
  const kind = (record: NotificationRecoveryRecord | null) =>
    planNotificationRecovery(record, { now, staleAfterMs }).kind;

  assert.equal(kind(null), "no-record");
  assert.equal(kind(rec({ status: "PENDING" })), "pending");
  assert.equal(kind(rec({ status: "SENT", providerMessageId: "re_1" })), "already-sent");
  assert.equal(kind(rec({ status: "FAILED" })), "retryable");
  assert.equal(kind(rec({ status: "NEEDS_REVIEW" })), "ambiguous");
  assert.equal(
    kind(rec({ status: "IN_PROGRESS", claimedAt: new Date(now.getTime() - 60_000) })),
    "in-flight",
    "a recent claim is left alone",
  );
  assert.equal(
    kind(rec({ status: "IN_PROGRESS", claimedAt: new Date(now.getTime() - 20 * 60_000) })),
    "ambiguous-stale-in-flight",
    "an abandoned claim needs a human",
  );
  assert.equal(kind(rec({ status: "WAT" })), "ambiguous", "unknown status is ambiguous");
  pass("recovery planner classifies every lifecycle state, including stale claims");
}

// ── Reconciliation is guarded and never blind ───────────────────────────────

{
  const ambiguous: NotificationRecoveryPlan = { kind: "ambiguous", reason: "resend:na" };
  const stale: NotificationRecoveryPlan = { kind: "ambiguous-stale-in-flight", ageMs: 1_200_000 };
  assert.equal(planReconciliationTransition(ambiguous, "confirmed-not-accepted", true).action, "reset-to-pending");
  assert.equal(planReconciliationTransition(stale, "confirmed-accepted", true).action, "mark-sent");
  assert.equal(
    planReconciliationTransition(ambiguous, "confirmed-accepted", false).action,
    "refuse",
    "confirmation is mandatory",
  );
  for (const p of [
    { kind: "retryable", reason: null } as const,
    { kind: "pending" } as const,
    { kind: "already-sent", providerMessageId: "re" } as const,
    { kind: "in-flight", ageMs: 1 } as const,
    { kind: "no-record" } as const,
  ]) {
    assert.equal(
      planReconciliationTransition(p, "confirmed-not-accepted", true).action,
      "refuse",
      `${p.kind} must not be reconciled`,
    );
  }
  pass("only ambiguous records reconcile, and only with explicit confirmation");
}

// ── Historical reconciliation: report-first, selection-required, idempotent ─

{
  const candidates = [
    { id: "o1", orderNumber: "KF-1", type: "PRODUCT", paymentStatus: "PAID", customerEmail: "a@b.c" },
    { id: "o2", orderNumber: "KF-2", type: "SERVICE", paymentStatus: "PAID", customerEmail: "c@d.e" },
    { id: "o3", orderNumber: "KF-3", type: "REPAIR", paymentStatus: "PAID", customerEmail: "x@y.z" },
    { id: "o4", orderNumber: "KF-4", type: "PRODUCT", paymentStatus: "PAID", customerEmail: "" },
  ];
  const rows = new Map<string, string>();
  const queuedCalls: string[] = [];
  const deps: ReconciliationDeps = {
    listMissing: async ({ orderIds }) =>
      orderIds ? candidates.filter((c) => orderIds.includes(c.id)) : candidates,
    queue: async (id) => {
      queuedCalls.push(id);
      const had = rows.has(id);
      if (!had) rows.set(id, "PENDING");
      return had ? "exists" : "created";
    },
  };

  const dry = await reconcilePaidConfirmations(deps, { dryRun: true });
  assert.equal(dry.dryRun, true);
  assert.equal(dry.rows.filter((r) => r.action === "would-queue").length, 2, "only sendable orders would queue");
  assert.equal(dry.rows.filter((r) => r.action === "skipped-ineligible").length, 2);
  assert.deepEqual(queuedCalls, [], "a dry run must never queue");

  let threw = false;
  try {
    await reconcilePaidConfirmations(deps, { dryRun: false });
  } catch {
    threw = true;
  }
  assert.equal(threw, true, "apply without an explicit selection is refused");

  const applied = await reconcilePaidConfirmations(deps, { dryRun: false, orderIds: ["o1", "o2"] });
  assert.equal(applied.queued, 2);
  assert.equal(applied.skipped, 0);
  assert.equal(rows.get("o1"), "PENDING");

  const again = await reconcilePaidConfirmations(deps, { dryRun: false, orderIds: ["o1", "o2"] });
  assert.equal(again.queued, 0, "a re-run must not duplicate");
  assert.equal(again.alreadyPresent, 2);
  pass("historical reconciliation is report-first, selection-required and idempotent");
}

// ── Crash-window backfill (no settlement-tx coupling) ───────────────────────

{
  // Simulate: the payment tx committed but the post-commit notification write
  // never ran. Reconciliation finds the gap, queues exactly one PENDING row, and
  // a later pass finds nothing left to do.
  const store = new Map<string, string>();
  const deps: ReconciliationDeps = {
    listMissing: async () =>
      store.has("o1")
        ? []
        : [{ id: "o1", orderNumber: "KF-1", type: "PRODUCT", paymentStatus: "PAID", customerEmail: "a@b.c" }],
    queue: async (id) => {
      const had = store.has(id);
      if (!had) store.set(id, "PENDING");
      return had ? "exists" : "created";
    },
  };
  const first = await reconcilePaidConfirmations(deps, { dryRun: false, orderIds: ["o1"] });
  assert.equal(first.queued, 1);
  assert.equal(store.get("o1"), "PENDING");
  const second = await reconcilePaidConfirmations(deps, { dryRun: false, orderIds: ["o1"] });
  assert.equal(second.examined, 0, "the order no longer looks missing");
  assert.equal(second.queued, 0, "the gap is closed exactly once");
  pass("reconciliation backfills the post-commit crash window exactly once");
}

// ── Resend outcome classification / diagnostics ─────────────────────────────

{
  assert.equal(classifyResendApiError({ statusCode: 422 }), "rejected");
  assert.equal(classifyResendApiError({ statusCode: 429 }), "rejected");
  assert.equal(classifyResendApiError({ statusCode: 500 }), "ambiguous");
  assert.equal(classifyResendApiError({ statusCode: null }), "ambiguous");
  assert.equal(classifyResendApiError("nonsense"), "ambiguous");
  pass("4xx rejected vs 5xx/null ambiguous classification");
}

{
  const diagnostic = resendErrorDiagnostic({
    message: "The recipient address aditi@example.com bounced off contact@keebforge.in",
    statusCode: 422,
    name: "validation_error",
  });
  assert.equal(diagnostic, "resend:validation_error:422");
  for (const leak of ["aditi@example.com", "bounced", "contact@keebforge.in"]) {
    assert.ok(!diagnostic.includes(leak), "diagnostic must not leak the message");
  }
  assert.equal(resendErrorDiagnostic({ message: "secrets!" }), "resend:unknown:na");
  pass("resend diagnostic carries only safe machine fields, never the message");
}

// ── Route / action wiring (source pin) ──────────────────────────────────────

{
  const verify = fs.readFileSync(
    path.join(REPO, "src/app/api/payments/verify/route.ts"),
    "utf8",
  );
  const webhook = fs.readFileSync(
    path.join(REPO, "src/app/api/payments/webhook/route.ts"),
    "utf8",
  );
  const repair = fs.readFileSync(
    path.join(REPO, "src/app/actions/repair-request.ts"),
    "utf8",
  );
  assert.ok(verify.includes("notifyPaidOrder"), "verify must call notifyPaidOrder");
  assert.ok(verify.includes("let paidNow = false"), "verify must track the PAID transition");
  const verifyCall = verify.indexOf("notifyPaidOrder(order.id)");
  const verifySync = verify.indexOf("syncTrackingCache(order.id)");
  assert.ok(verifyCall > verifySync, "notification runs after the transaction commits");
  assert.ok(webhook.includes("notifyPaidOrder"), "webhook must call notifyPaidOrder");
  const webhookCall = webhook.indexOf("notifyPaidOrder(order!.id)");
  const webhookSync = webhook.indexOf("refreshTrackingCache(order!.id)");
  assert.ok(webhookCall > webhookSync, "webhook notification runs after tracking refresh");
  assert.ok(repair.includes("const { error } = await resend.emails.send"), "repair action must inspect Resend error");
  assert.ok(repair.includes("resendErrorDiagnostic"), "repair action must use the sanitized diagnostic");
  pass("verify/webhook notify after commit; repair action uses sanitized diagnostics");
}

// ── Admin manual payment (M2) and operator reconciliation (M1/M3) ───────────

{
  const adminOrders = fs.readFileSync(
    path.join(REPO, "src/app/admin/actions/orders.ts"),
    "utf8",
  );
  assert.ok(
    adminOrders.includes("shouldNotifyAfterManualPayment"),
    "manual payment notify must use the shared gate",
  );
  const notifyCount = (adminOrders.match(/notifyPaidOrder\(/g) ?? []).length;
  assert.equal(notifyCount, 1, "exactly one notify call lives in the admin actions");

  const upStart = adminOrders.indexOf("export async function updateOrderAmounts");
  const upEnd = adminOrders.indexOf("export async function", upStart + 10);
  const upBody = adminOrders.slice(upStart, upEnd);
  assert.ok(upStart >= 0 && upEnd > upStart, "updateOrderAmounts must be locatable");
  assert.ok(
    !upBody.includes("notifyPaidOrder"),
    "a total-price edit alone must never notify",
  );
  pass("admin notifies on a real manual payment but never on a price edit");
}

{
  const file = path.join(REPO, "src/app/admin/actions/notifications.ts");
  assert.ok(fs.existsSync(file), "operator notification actions must exist");
  const src = fs.readFileSync(file, "utf8");
  const pin = [
    "requirePermission",
    "reportMissingPaidNotifications",
    "dryRun: true",
    "queuePaidNotifications",
    "reconcileOrderNotification",
    "resendPaidConfirmation",
    "retryFailedOrderNotification",
  ];
  for (const needle of pin) {
    assert.ok(src.includes(needle), `operator actions must include ${needle}`);
  }
  assert.ok(
    src.includes('requirePermission("order", "update")'),
    "every mutating operator action must be gated on order:update",
  );
  pass("operator actions are permission-gated with dry-run, queue, reconcile, retry and resend");
}

// ── Admin page authorization (page, not just actions) ───────────────────────

{
  const page = fs.readFileSync(
    path.join(REPO, "src/app/admin/notifications/page.tsx"),
    "utf8",
  );
  assert.ok(
    page.includes('requirePermission("order", "view")'),
    "the page itself must be server-side authorized",
  );
  assert.ok(
    page.includes("listOrderNotificationsNeedingAttention"),
    "the page must read the attention list",
  );

  const shell = fs.readFileSync(
    path.join(REPO, "src/components/admin/AdminShell.tsx"),
    "utf8",
  );
  assert.ok(shell.includes('"/admin/notifications"'), "nav must link the page");

  for (const role of ["STAFF", "DEVELOPER", "ADMIN"] as const) {
    assert.ok(
      allowedNavHrefs(role).includes("/admin/notifications"),
      `${role} should see the notifications nav entry`,
    );
  }
  assert.ok(
    !allowedNavHrefs("CUSTOMER").includes("/admin/notifications"),
    "CUSTOMER must not see the notifications nav entry",
  );
  pass("notifications page is authorized server-side and gated in navigation");
}

console.log(`\nAll ${n} paid-confirmation checks passed.`);
})();