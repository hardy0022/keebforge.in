import crypto from "crypto";

/**
 * Constant-time comparison for the two Razorpay handshakes.
 *
 * Both `/api/payments/verify` and `/api/payments/webhook` accept an HMAC-SHA256
 * produced by Razorpay and compared it with `!==`. A byte-by-byte string compare
 * short-circuits on the first differing character, so the time it takes to
 * reject a forged signature leaks how many leading characters were right.
 * `crypto.timingSafeEqual` is the fix, and both routes must use the same one —
 * a helper that only one of them calls is a helper the other will drift from.
 */

/**
 * Compare two hex digests without leaking their contents through timing.
 *
 * @returns true only when `provided` is exactly `expectedHex`. A missing, empty,
 * malformed or differently-sized digest is false — it can never match, and it
 * must not reach `timingSafeEqual`, which throws on a length mismatch.
 */
export function timingSafeEqualHex(
  expectedHex: string,
  provided: string | null | undefined,
): boolean {
  if (typeof provided !== "string" || provided === "") return false;
  const expected = Buffer.from(expectedHex, "hex");
  if (expected.length === 0) return false;
  // Buffer.from(_, "hex") silently stops at the first invalid pair rather than
  // throwing, so a malformed digest simply decodes to fewer bytes — which the
  // length check below rejects.
  const presented = Buffer.from(provided, "hex");
  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, presented);
}

/**
 * The HMAC Razorpay signs a checkout handshake with: `<order_id>|<payment_id>`,
 * keyed with the API key secret (NOT the webhook secret — that is a different
 * key for a different signature).
 */
export function razorpayCheckoutSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  keySecret: string,
): string {
  return crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
}

/**
 * Verify a checkout handshake signature in constant time.
 *
 * Returns false — never throws and never writes — when the key secret is absent
 * or blank, so a missing configuration cannot silently accept anything.
 */
export function verifyRazorpayCheckoutSignature(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string | null | undefined;
  keySecret: string | null | undefined;
}): boolean {
  const secret = args.keySecret?.trim();
  if (!secret) return false;
  return timingSafeEqualHex(
    razorpayCheckoutSignature(
      args.razorpayOrderId,
      args.razorpayPaymentId,
      secret,
    ),
    args.signature,
  );
}