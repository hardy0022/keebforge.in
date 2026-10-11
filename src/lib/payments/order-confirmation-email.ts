import { Resend } from "resend";
import { EXCHANGE_PARAM } from "@/lib/payments/order-capability";
import { SITE_URL } from "@/lib/seo";
import {
  logSuppressedDelivery,
  resolveOutboundRecipient,
} from "@/lib/email/outbound";

/**
 * Guest order confirmation email — the recovery path for the payment
 * capability. Without it a guest who closes the tab before paying has no way
 * back to their own order, which is the only thing standing between them and
 * forcing every guest to create an account.
 *
 * Reuses the existing Resend setup (RESEND_API_KEY / EMAIL_FROM) already used
 * by lib/auth/better-auth.ts and the inquiry + repair actions.
 *
 * The link carries a short-lived, single-use exchange code rather than the
 * payment capability itself: the code only becomes a usable capability after the
 * customer presses Continue on the interstitial page, and it is worthless
 * afterwards. No other order data is included, and nothing is logged.
 */
export async function sendGuestOrderConfirmation(params: {
  to: string;
  orderNumber: string;
  exchangeCode: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Unconfigured in local dev — the checkout browser already holds the cookie,
    // so payment still works; only cross-device recovery is unavailable.
    console.warn(
      "[order-confirmation] RESEND_API_KEY unset — confirmation email skipped",
    );
    return;
  }

  const { to, orderNumber, exchangeCode } = params;

  // Test/suppression policy: redirect to a single test address, or skip the
  // send entirely. Either way checkout is unaffected — the customer still holds
  // the capability in this browser.
  const plan = resolveOutboundRecipient(to);
  if (plan.action === "skip") {
    logSuppressedDelivery(plan.reason);
    return;
  }

  const payUrl =
    `${SITE_URL}/order/success/${encodeURIComponent(orderNumber)}/exchange` +
    `?${EXCHANGE_PARAM}=${encodeURIComponent(exchangeCode)}`;
  const trackUrl =
    `${SITE_URL}/track-order?order=${encodeURIComponent(orderNumber)}`;
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "KeebForge <onboarding@resend.dev>",
      to: [plan.to],
      subject: `Order ${orderNumber} confirmed — KeebForge`,
      html:
        `<h2>Thanks for your order — KeebForge</h2>` +
        `<p>Your order <strong>${esc(orderNumber)}</strong> is confirmed and ` +
        `awaiting payment.</p>` +
        `<p><a href="${esc(payUrl)}">Pay for order ${esc(orderNumber)}</a></p>` +
        `<p style="color:#888;font-size:12px">` +
        `This private link works once, and only in this browser, after you press ` +
        `Continue — please don't forward it. Tracking status is public at ` +
        `<a href="${esc(trackUrl)}">${esc(trackUrl)}</a>.</p>`,
    });
    if (error) {
// Never log the error object itself: a Resend failure can echo the
    // request payload, and that payload carries the exchange code.
      console.error(
        `[order-confirmation] send failed: ${error.name ?? "Error"}`,
      );
    }
  } catch (e) {
    // The order already exists and the customer holds the capability in this
    // browser — an email failure must never fail checkout.
    console.error(
      `[order-confirmation] error: ${e instanceof Error ? e.name : "Error"}`,
    );
  }
}