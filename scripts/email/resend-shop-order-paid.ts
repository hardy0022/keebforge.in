import { pathToFileURL } from "node:url";

/**
 * Local, network-free source for the `keebforge-shop-order-paid` Resend template.
 *
 * Resend renders the transactional email at send time; the application only
 * supplies already-decided variables (see `src/lib/notifications/paid-confirmation.ts`).
 * This file exists so the exact HTML, sender, reply-to, subject and variable
 * list can be reproduced, reviewed and diffed without touching the Resend
 * account. It performs NO network calls and never publishes anything: run it to
 * print the payload and create/publish the template manually (see
 * `docs/resend-templates.md`, section 2).
 *
 * Usage:
 *   npx tsx scripts/email/resend-shop-order-paid.ts          # print JSON payload
 *   npx tsx scripts/email/resend-shop-order-paid.ts --html   # print only the HTML
 *
 * Layout notes:
 *   - The KeebForge wordmark (the brand logo) sits at the left of the header bar,
 *     next to the order information (`ORDER #…`) on the right, on the same row.
 *   - "Thank you for your order!" and the green "✓ PAYMENT CONFIRMED" badge are
 *     placed in one table row so they stay side-by-side on desktop clients and
 *     wrap naturally only on very narrow screens.
 *   - There is deliberately NO banner image anywhere in the template.
 *   - Product images are not baked into this template: they arrive pre-rendered
 *     inside the `{{{itemsHtml}}}` variable, alongside the rest of each item row.
 */

const BRAND = {
  accent: "#a3e635",
  accentText: "#0a0a0a",
  accentInk: "#4d7c0f",
  ink: "#18181b",
  muted: "#71717a",
  border: "#e4e4e7",
  font: "Arial,Helvetica,sans-serif",
} as const;

export type ResendTemplateVariable = {
  key: string;
  type: "string" | "number";
  fallbackValue: string;
};

export type ResendTemplateSource = {
  name: string;
  envName: string;
  from: string;
  replyTo: string;
  subject: string;
  variables: ResendTemplateVariable[];
  html: string;
};

const header = (right = ""): string =>
  `<tr><td style="padding:20px 28px;border-bottom:1px solid ${BRAND.border};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td align="left" valign="middle" style="font-family:${BRAND.font};font-size:20px;font-weight:700;color:${BRAND.ink};letter-spacing:-0.01em;">KeebForge<span style="color:${BRAND.accentInk};">.</span>in</td><td align="right" valign="middle" style="font-family:${BRAND.font};font-size:12px;font-weight:700;color:${BRAND.muted};letter-spacing:0.06em;white-space:nowrap;">${right}</td></tr></table></td></tr>`;

const footer = (): string =>
  `<tr><td style="padding:20px 28px;border-top:1px solid ${BRAND.border};"><p style="margin:0 0 8px 0;font-family:${BRAND.font};font-size:13px;line-height:1.5;color:${BRAND.muted};">Questions? Reply to this email or write to <a href="mailto:contact@keebforge.in" style="color:${BRAND.accentInk};text-decoration:none;">contact@keebforge.in</a>.</p><p style="margin:0;font-family:${BRAND.font};font-size:12px;line-height:1.5;color:${BRAND.muted};"><a href="https://keebforge.in" style="color:${BRAND.muted};text-decoration:none;">KeebForge.in</a> &middot; Keyboard &amp; mouse repair across India</p></td></tr>`;

const shell = ({
  preheader,
  headerRight = "",
  content,
}: {
  preheader: string;
  headerRight?: string;
  content: string;
}): string =>
  `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head><body style="margin:0;padding:0;background:#ffffff;-webkit-text-size-adjust:100%;"><div style="display:none;max-height:0;height:0;overflow:hidden;opacity:0;color:#ffffff;font-size:1px;line-height:1px;">${preheader}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:#ffffff;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${BRAND.border};border-radius:12px;">${header(headerRight)}<tr><td style="padding:28px 28px 24px 28px;">${content}</td></tr>${footer()}</table></td></tr></table></body></html>`;

const p = (t: string): string =>
  `<p style="margin:0 0 14px 0;font-family:${BRAND.font};font-size:15px;line-height:1.6;color:${BRAND.ink};">${t}</p>`;

const muted = (t: string): string =>
  `<p style="margin:16px 0 0 0;font-family:${BRAND.font};font-size:13px;line-height:1.6;color:${BRAND.muted};">${t}</p>`;

const label = (t: string): string =>
  `<p style="margin:24px 0 4px 0;font-family:${BRAND.font};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND.muted};">${t}</p>`;

const button = (href: string, text: string): string =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0 0;"><tr><td align="center" bgcolor="${BRAND.accent}" style="border-radius:8px;"><a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${BRAND.font};font-size:15px;font-weight:700;color:${BRAND.accentText};text-decoration:none;border-radius:8px;">${text}</a></td></tr></table>`;

/**
 * The heading and the green confirmation badge, forced onto one table row so a
 * normal desktop client keeps them side-by-side.
 */
const headingWithBadge = (heading: string, badge: string): string =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;"><tr><td align="left" valign="middle"><h1 style="margin:0;font-family:${BRAND.font};font-size:22px;line-height:1.3;font-weight:700;color:${BRAND.ink};">${heading}</h1></td><td align="right" valign="middle" style="padding-left:12px;white-space:nowrap;"><span style="display:inline-block;background:${BRAND.accent};color:${BRAND.accentText};font-family:${BRAND.font};font-size:11px;font-weight:700;letter-spacing:0.06em;padding:6px 12px;border-radius:999px;">${badge}</span></td></tr></table>`;

const kv = (rows: Array<[string, string]>): string => {
  const cell = `padding:10px 0;border-top:1px solid ${BRAND.border};vertical-align:top;`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">` +
    rows
      .map(
        ([k, v]) =>
          `<tr><td style="${cell}width:170px;font-family:${BRAND.font};font-size:13px;color:${BRAND.muted};">${k}</td><td style="${cell}font-family:${BRAND.font};font-size:14px;color:${BRAND.ink};">${v}</td></tr>`,
      )
      .join("") +
    `</table>`
  );
};

const v = (key: string, fallbackValue = ""): ResendTemplateVariable => ({
  key,
  type: "string",
  fallbackValue,
});

export function buildShopOrderPaidTemplate(): ResendTemplateSource {
  return {
    name: "keebforge-shop-order-paid",
    envName: "RESEND_TEMPLATE_SHOP_ORDER_PAID",
    // Sender display name per the approved design. The live send path takes the
    // sender from `EMAIL_FROM` (payload `from` overrides the template default);
    // see docs/resend-templates.md.
    from: "KeebForge.in <orders@keebforge.in>",
    replyTo: "contact@keebforge.in",
    subject: "Order {{orderNumber}} — Payment Confirmed | KeebForge.in",
    variables: [
      v("orderNumber", "KF-000000"),
      v("customerName", "Customer"),
      // Pre-rendered, already-escaped HTML fragments (inserted unescaped).
      v("itemsHtml"),
      v("totalsHtml"),
      v("shippingName", "Customer"),
      v("shippingAddress", "To be confirmed"),
      v("orderUrl", "https://keebforge.in/track-order"),
    ],
    html: shell({
      preheader: "Payment received for order {{{orderNumber}}}",
      headerRight: "ORDER #{{{orderNumber}}}",
      content:
        headingWithBadge("Thank you for your order!", "✓ PAYMENT CONFIRMED") +
        p("Hi {{{customerName}}},") +
        p(
          "We have received your payment for order <strong>{{{orderNumber}}}</strong>. This confirms your order is paid.",
        ) +
        label("Order summary") +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">{{{itemsHtml}}}</table>` +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin-top:4px;">{{{totalsHtml}}}</table>` +
        label("Shipping to") +
        kv([
          ["Name", "{{{shippingName}}}"],
          ["Address", "{{{shippingAddress}}}"],
        ]) +
        label("Next steps") +
        p(
          "Our team will contact you using the details you provided to coordinate the next steps.",
        ) +
        button("{{{orderUrl}}}", "View your order") +
        muted(
          "Thank you for choosing KeebForge. We will be in touch if we need any additional information.",
        ),
    }),
  };
}

// ── CLI (no network) ────────────────────────────────────────────────────────
// Print the template payload so the exact HTML can be reproduced. Publishing to
// Resend is a deliberate manual/API step documented in docs/resend-templates.md.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const template = buildShopOrderPaidTemplate();
  if (process.argv.includes("--html")) {
    process.stdout.write(template.html + "\n");
  } else {
    process.stdout.write(JSON.stringify(template, null, 2) + "\n");
  }
}
