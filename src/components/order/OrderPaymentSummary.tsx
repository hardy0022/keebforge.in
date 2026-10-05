"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RazorpayScript } from "@/components/payments/RazorpayScript";
import {
  launchRazorpayPayment,
  type CreateOrderResponse,
} from "@/lib/payments/razorpay-pay";
import { formatINR } from "@/lib/utils/money";

type Props = {
  orderNumber: string;
  total: number;
  /**
   * True when the request's HttpOnly payment cookie matched the order's stored
   * capability hash. The cookie itself never reaches this component.
   */
  canPay?: boolean;
  /** True when the signed-in session owns this order (no cookie needed). */
  ownedBySession?: boolean;
};

export function OrderPaymentSummary({
  orderNumber,
  total,
  canPay = false,
  ownedBySession = false,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Without entitlement there is nothing to send — /api/payments/pay-inline
  // would reject it anyway. The button stays visible so the page looks the
  // same; it just explains where to get a valid link.
  const entitled = canPay || ownedBySession;

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      // Same-origin POST, so the HttpOnly payment cookie rides along
      // automatically. Nothing secret is in the body or the URL.
      const res = await fetch("/api/payments/pay-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const data = (await res
        .json()
        .catch(() => null)) as CreateOrderResponse | null;
      if (!res.ok || !data) {
        setError(
          data?.error ?? "Could not start payment. Please try again.",
        );
        setBusy(false);
        return;
      }
      launchRazorpayPayment({
        order: data,
        description: `Payment for order ${data.orderNumber}`,
        // No prefill: pay-inline no longer returns customer PII. Razorpay
        // collects name/email/contact itself.
        prefill: { name: "", email: "", contact: "" },
        onVerified: () => {
          setBusy(false);
          router.refresh();
        },
        onDismissed: () => setBusy(false),
        onError: (msg) => {
          setError(msg);
          setBusy(false);
        },
      });
    } catch {
      setError(
        "Could not reach the payment server. Check your connection and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="os-pay-line">
      <RazorpayScript />
      <span className="os-pay-line-label">Payment</span>
      <span className="os-pay-line-pending">Pending</span>
      {entitled ? (
        <>
          <button
            type="button"
            className="btn-prime btn-sm os-pay-now"
            onClick={() => void pay()}
            disabled={busy}
          >
            {busy ? "Opening payment…" : `Pay ${formatINR(total)} now`}
          </button>
          {error && (
            <p role="alert" className="os-pay-err">
              {error}
            </p>
          )}
        </>
      ) : (
        // Entitlement is deliberately absent: this visitor reached the page
        // with only the order number. Say where the real link comes from
        // rather than failing on click.
        <p className="os-pay-note">
          Open the payment link from your confirmation email, or{" "}
          <Link href="/contact">contact support</Link> to pay for this order.
        </p>
      )}
    </div>
  );
}
