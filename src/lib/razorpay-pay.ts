export type CreateOrderResponse = {
  orderNumber: string;
  orderId: string;
  razorpayOrderId?: string;
  amount?: number;
  currency?: string;
  keyId?: string;
  requiresQuote?: boolean;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  error?: string;
};

type LaunchRazorpayOpts = {
  order: CreateOrderResponse;
  description: string;
  prefill: { name: string; email: string; contact: string };
  onVerified: () => void;
  onDismissed: () => void;
  onError: (msg: string) => void;
};

/** Opens the Razorpay modal and verifies the result server-side. Shared by checkout + track-order pay. */
export function launchRazorpayPayment({ order, description, prefill, onVerified, onDismissed, onError }: LaunchRazorpayOpts) {
  if (!window.Razorpay || !order.keyId || !order.razorpayOrderId || !order.amount || !order.currency) {
    onError("Payment gateway failed to load. Refresh the page and try again.");
    return;
  }
  const rzp = new window.Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: "KeebForge",
    description,
    order_id: order.razorpayOrderId,
    prefill,
    notes: { orderId: order.orderId, orderNumber: order.orderNumber },
    theme: { color: "#d4f700" },
    handler: (response) => {
      void (async () => {
        try {
          const res = await fetch("/api/payments/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...response, orderId: order.orderId }),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            onError((data as { error?: string } | null)?.error ?? "Payment verification failed. Contact support with your payment ID.");
            return;
          }
          onVerified();
        } catch {
          onError("Payment verification failed. Please contact support.");
        }
      })();
    },
    modal: { ondismiss: onDismissed },
  });
  rzp.open();
}