import assert from "node:assert/strict";
import { buildShopOrderPaidTemplate } from "./resend-shop-order-paid";

/**
 * Guards the local source of the shop paid-order Resend template. It never
 * contacts Resend and never sends email: it only proves the reproducible HTML
 * carries the approved layout, the exact metadata, the unchanged variables and
 * no forbidden content.
 */

function pass(message: string): void {
  console.log(`PASS ${message}`);
}

/** The nearest `<tr>…</tr>` around a needle (handles one level of nesting). */
function rowContaining(html: string, needle: string): string {
  const at = html.indexOf(needle);
  if (at === -1) return "";
  const open = html.lastIndexOf("<tr", at);
  const close = html.indexOf("</tr>", at);
  return open === -1 || close === -1 ? "" : html.slice(open, close);
}

const template = buildShopOrderPaidTemplate();
const { html } = template;

{
  assert.equal(template.name, "keebforge-shop-order-paid");
  assert.equal(template.envName, "RESEND_TEMPLATE_SHOP_ORDER_PAID");
  assert.equal(template.from, "KeebForge.in <orders@keebforge.in>");
  assert.equal(template.replyTo, "contact@keebforge.in");
  assert.equal(
    template.subject,
    "Order {{orderNumber}} — Payment Confirmed | KeebForge.in",
  );
  pass("shop template carries the approved name, sender, reply-to and subject");
}

{
  assert.deepEqual(
    template.variables.map((variable) => variable.key),
    [
      "orderNumber",
      "customerName",
      "itemsHtml",
      "totalsHtml",
      "shippingName",
      "shippingAddress",
      "orderUrl",
    ],
    "template variables are unchanged",
  );
  for (const variable of template.variables) {
    assert.equal(variable.type, "string");
  }
  pass("shop template keeps the existing variable set");
}

{
  // The list-shaped fragments must stay triple-braced so Resend inserts the
  // pre-escaped HTML verbatim.
  assert.ok(html.includes("{{{itemsHtml}}}"), "itemsHtml is triple-braced");
  assert.ok(html.includes("{{{totalsHtml}}}"), "totalsHtml is triple-braced");
  assert.ok(/Order summary/.test(html));
  pass("shop template inserts the pre-rendered HTML fragments unescaped");
}

{
  const headingRow = rowContaining(html, "Thank you for your order!");
  assert.ok(headingRow.includes("Thank you for your order!"));
  assert.ok(
    headingRow.includes("✓ PAYMENT CONFIRMED"),
    "badge is on the heading row",
  );
  pass('heading and "✓ PAYMENT CONFIRMED" badge share one row');
}

{
  const headerRow = rowContaining(html, "KeebForge");
  assert.ok(headerRow.includes("KeebForge"), "wordmark/logo is in the header");
  assert.ok(
    headerRow.includes("ORDER #{{{orderNumber}}}"),
    "order information sits beside the logo on the header row",
  );
  pass("header row pairs the KeebForge logo with the order information");
}

{
  assert.equal(/banner/i.test(html), false, "no banner anywhere");
  assert.equal(html.includes("Banner.png"), false, "no Banner.png");
  pass("shop template contains no banner");
}

{
  assert.ok(html.includes(`href="{{{orderUrl}}}"`), "CTA uses orderUrl");
  const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
  for (const href of hrefs) {
    assert.ok(
      href === "{{{orderUrl}}}" ||
        href === "mailto:contact@keebforge.in" ||
        href === "https://keebforge.in",
      `unexpected href: ${href}`,
    );
  }
  pass("CTA and footer links are the only URLs");
}

{
  const json = JSON.stringify(template);
  assert.equal(/keydir|app\.keydir|acme/i.test(json), false, "no foreign branding");
  pass("shop template contains no KeyDir/Acme references");
}

{
  assert.equal(
    /razorpay|api[_-]?key|secret|capability|password/i.test(html),
    false,
    "no secrets or payment identifiers",
  );
  pass("shop template leaks no secrets or payment identifiers");
}

{
  assert.ok(html.includes("background:#ffffff"), "white card on light shell");
  assert.ok(html.includes("contact@keebforge.in"), "footer contact address");
  assert.ok(html.includes("KeebForge.in"), "KeebForge.in branding");
  pass("shop template keeps the white card and KeebForge.in branding");
}

console.log("all shop paid-order template checks passed");
