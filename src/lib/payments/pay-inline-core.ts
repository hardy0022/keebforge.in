import {
  normalizeOrderNumber,
  verifyOrderPayCookie,
} from "@/lib/payments/order-capability";
import { outstandingBalance } from "@/lib/payments/refund-accounting";

/**
 * Payment-initialisation core for POST /api/payments/pay-inline.
 *
 * Extracted from the route so the whole decision — authorisation first, then
 * payability, then Razorpay — is exercised by tests against fake deps. The
 * ordering below is the security property: nothing customer-specific leaves
 * this function and no gateway call is made until `authorize` has passed.
 *
 * All dependencies are injected so no test touches prisma or Razorpay.
 */

export type InlinePaymentOrder = {
  id: string;
  orderNumber: string;
  total: number;
  paymentStatus: string;
  profileId: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  billingDetails: unknown;
  payments: Array<{
    amount: number;
    status: string;
    /** Cumulative refunded against this payment. Null before the migration. */
    refundedAmount?: number | null;
  }>;
};

export type InlinePaymentDeps = {
  findOrder: (orderNumber: string) => Promise<InlinePaymentOrder | null>;
  /** Session-bound profile id, or null for an anonymous caller. */
  currentProfileId: () => Promise<string | null>;
  /**
   * Merge `patch` into the order's billingDetails without replacing the
   * document. Whole-document replacement would be a lost update: anything written
   * between this handler's read and its write — a redeemed exchange code, a
   * freshly minted capability — would be silently reverted.
   */
  patchBillingDetails: (
    orderId: string,
    patch: Record<string, string | number | null>,
  ) => Promise<void>;
  /** Razorpay customer upsert. Must NOT be called before authorization. */
  ensureCustomer: (order: InlinePaymentOrder) => Promise<string | null>;
  /** Razorpay order creation. Must NOT be called before authorization. */
  createRazorpayOrder: (args: {
    amount: number;
    receipt: string;
    orderId: string;
    orderNumber: string;
  }) => Promise<{ id: string; amount: number; currency: string }>;
  keyId: string | null;
};

export type InlinePaymentResult = {
  status: number;
  body: Record<string, unknown>;
};

/**
 * Single response for "no such order" and "not entitled". Distinguishing them
 * would turn this endpoint into an order-number oracle.
 */
function unauthorized(): InlinePaymentResult {
  return {
    status: 404,
    body: { error: "We couldn't verify your access to this order." },
  };
}

/**
 * A caller is entitled when they present the order's capability token, or when
 * they are signed in as the profile that owns the order. Session ownership is a
 * deliberate second path: it keeps authenticated checkout working without
 * forcing signed-in customers to carry a capability.
 */
export function isEntitledToPay(
  order: InlinePaymentOrder,
  token: unknown,
  sessionProfileId: string | null,
): boolean {
  if (verifyOrderPayCookie(token, order.billingDetails)) {
    return true;
  }
  return Boolean(
    sessionProfileId && order.profileId && sessionProfileId === order.profileId,
  );
}

export async function startInlinePayment(
  deps: InlinePaymentDeps,
  /**
   * `capabilityToken` is the value of the HttpOnly payment cookie, resolved by
   * the route from `next/headers`. It is never read from the request body.
   */
  input: { orderNumber: unknown; capabilityToken: unknown },
): Promise<InlinePaymentResult> {
  const orderNumber = normalizeOrderNumber(input.orderNumber);
  if (!orderNumber) {
    return {
      status: 400,
      body: { error: "That doesn't look like a valid order number." },
    };
  }

  const order = await deps.findOrder(orderNumber);
  if (!order) return unauthorized();

  // ── Authorization gate ────────────────────────────────────────────────────
  // Everything below this line may touch customer data or the Razorpay API.
  const sessionProfileId = await deps.currentProfileId();
  if (!isEntitledToPay(order, input.capabilityToken, sessionProfileId)) {
    return unauthorized();
  }

  if (order.paymentStatus === "PAID" || order.paymentStatus === "REFUNDED") {
    return { status: 400, body: { error: "This order is already paid." } };
  }

  // What is still owed, in paise.
  //
  // NET of refunds, never gross. This used to sum only `status === "PAID"`,
  // which meant a fully refunded payment dropped out of the sum entirely and the
  // balance snapped back to the full order total — asking a customer who had just
  // been refunded in full to pay the whole amount again. Summing PAID + REFUNDED
  // instead would have the mirror-image bug, treating returned money as retained.
  const outstanding = outstandingBalance({ total: order.total, payments: order.payments });
  if (outstanding <= 0) {
    return {
      status: 400,
      body: {
        error:
          "There's nothing to pay for this order yet — final pricing may still be pending.",
      },
    };
  }

  if (!order.customerEmail || !deps.keyId) {
    return {
      status: 503,
      body: {
        error:
          "Online payments are temporarily unavailable. Please contact support.",
      },
    };
  }

  const billing = (
    order.billingDetails && typeof order.billingDetails === "object"
      ? order.billingDetails
      : {}
  ) as Record<string, unknown>;

  // ── Reuse the order's existing Razorpay order when it still covers the
  // amount owed. Re-opening the same Razorpay order is a free retry; creating a
  // second one would orphan the first and re-point /verify at a payment the
  // customer may already have in flight. Only a changed amount (e.g. a partial
  // capture) forces a fresh order, because the stored one no longer matches.
  const existingId =
    typeof billing.razorpayOrderId === "string" && billing.razorpayOrderId
      ? billing.razorpayOrderId
      : null;
  if (existingId && billing.razorpayOrderAmount === outstanding) {
    return {
      status: 200,
      body: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        razorpayOrderId: existingId,
        amount: outstanding,
        currency: "INR",
        keyId: deps.keyId,
      },
    };
  }

  const razorpayCustomerId = await deps.ensureCustomer(order);
  const rzpOrder = await deps.createRazorpayOrder({
    amount: outstanding,
    receipt: order.orderNumber,
    orderId: order.id,
    orderNumber: order.orderNumber,
  });

  // Only the Razorpay paths are written. A merge, not a replacement: replacing the
  // document from the snapshot read above would revert anything a concurrent
  // exchange redemption had just changed.
  await deps.patchBillingDetails(order.id, {
    razorpayOrderId: rzpOrder.id,
    razorpayOrderAmount: rzpOrder.amount,
    ...(razorpayCustomerId ? { razorpayCustomerId } : {}),
  });

  return {
    status: 200,
    body: {
      orderId: order.id,
      orderNumber: order.orderNumber,
      razorpayOrderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: deps.keyId,
    },
  };
}