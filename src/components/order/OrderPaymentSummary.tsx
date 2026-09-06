"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RazorpayScript } from "@/components/payments/RazorpayScript";
import {
  launchRazorpayPayment,
  type CreateOrderResponse,
} from "@/lib/razorpay-pay";
import { formatINR } from "@/lib/money";

type Props = {
  orderNumber: string;
  total: number;
};

export function OrderPaymentSummary({ orderNumber, total }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/payments/pay-inline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber }),
      });
      const data = (await res
        .json()
        .catch(() => null)) as CreateOrderResponse | null;
      if (!res.ok || !data) {
        setError(data?.error ?? "Could not start payment. Please try again.");
        setBusy(false);
        return;
      }
      launchRazorpayPayment({
        order: data,
        description: `Payment for order ${data.orderNumber}`,
        prefill: {
          name: data.customerName ?? "",
          email: data.customerEmail ?? "",
          contact: data.customerPhone ?? "",
        },
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
    </div>
  );
}
