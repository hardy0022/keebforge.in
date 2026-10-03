import crypto from "crypto";

/**
 * Guest-payment capability tokens.
 *
 * An order number is a public identifier — it appears in confirmation emails,
 * /track-order and /order/success URLs — so it can never authorise a payment.
 * Instead every payable order gets an opaque, high-entropy capability that
 * authorises payments and is delivered over an HttpOnly cookie.
 *
 * There are two ways to obtain that cookie, and both must keep working:
 *  - the checkout browser gets it via `Set-Cookie` from create-order, so the
 *    post-checkout redirect lands on a clean URL;
 *  - the email link carries a separate, short-lived exchange code which an
 *    explicit Continue POST redeems for a freshly minted capability, so the
 *    order can also be paid from another browser or device.
 *
 * Both hashes stay valid simultaneously: a browser that holds the checkout
 * capability keeps working after the email link is redeemed elsewhere, and the
 * other way round.
 *
 * Invariants:
 *  - tokens are `crypto.randomBytes`, never derived from order data;
 *  - only SHA-256 hashes are persisted, inside the order's existing
 *    `billingDetails` JSON (no migration);
 *  - plaintexts are never stored, logged or returned by a generic API;
 *  - the exchange code is single-use and expiring; redeeming it never disturbs
 *    the checkout browser's own capability.
 */

const TOKEN_BYTES = 32;
const HASH_ALGO = "sha256";

/** Key inside `Order.billingDetails` holding the capability hash. */
export const GUEST_TOKEN_HASH_KEY = "guestPaymentTokenHash";

/**
 * Key inside `Order.billingDetails` holding the hash of the email exchange code
 * until it is redeemed, then the hash of the cookie capability minted by that
 * redemption. Overwriting one hash with the other is what makes the code
 * single-use: a replay no longer matches.
 */
export const EXCHANGE_HASH_KEY = "guestPaymentExchangeTokenHash";

/** Key inside `Order.billingDetails` holding the exchange-code expiry (epoch ms). */
export const EXCHANGE_EXPIRY_KEY = "guestPaymentExchangeExpiresAt";

/**
 * Key inside `Order.billingDetails` holding the exchange slot's lifecycle state.
 *
 * The redemption flag used to be implied by the expiry key's *absence*, which
 * meant any order without exchange data at all — a services order, or anything
 * created before the feature — also looked "redeemed". Two missing keys happened
 * to be harmless; one missing key would not have been. The state is explicit so
 * that an absent or unknown value can only ever mean "cannot pay".
 */
export const EXCHANGE_STATE_KEY = "guestPaymentExchangeState";

/** Issued, not yet spent. The only state in which a code may be redeemed. */
export const EXCHANGE_STATE_REDEEMABLE = "redeemable";

/** Spent. The slot now holds a minted capability hash, redeemable as a cookie. */
export const EXCHANGE_STATE_REDEEMED = "redeemed";

/**
 * HttpOnly cookie holding the order-scoped payment capability. Its value is the
 * same 43-char token the old `?pay=` parameter carried, so authorization is
 * unchanged — only the transport moved out of the URL and out of reach of
 * JavaScript, analytics SDKs and Razorpay's risk-detection bundle.
 */
export const PAY_COOKIE = "kf_pay";

/**
 * How long a freshly issued payment cookie lives. Long enough that a guest can
 * close the tab and come back, short enough that a shared machine does not keep
 * a working payment credential around indefinitely. Matches the cart cookie.
 */
export const PAY_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/** Query parameter carrying the single-use exchange code on the email link. */
export const EXCHANGE_PARAM = "code";

/**
 * Exchange codes are short-lived: the email link is a recovery path, not a
 * permanent credential. Seven days covers "placed it Friday, paid it Monday"
 * while keeping an inbox-forwarded link from working forever.
 */
export const EXCHANGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Mint a new capability. Persist `hash`; deliver `token` once, then drop it. */
export function createOrderCapability(): { token: string; hash: string } {
  const token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
  return { token, hash: hashOrderCapability(token) };
}

export function hashOrderCapability(token: string): string {
  return crypto.createHash(HASH_ALGO).update(token, "utf8").digest("hex");
}

/**
 * Constant-time comparison of a presented token against a stored hash.
 * Returns false — never throws — for any malformed or missing input so a caller
 * cannot distinguish "no token stored" from "wrong token".
 */
export function verifyOrderCapability(
  token: unknown,
  storedHash: unknown,
): boolean {
  if (typeof token !== "string" || token.length === 0) return false;
  if (typeof storedHash !== "string" || !/^[0-9a-f]{64}$/i.test(storedHash)) {
    return false;
  }
  const presented = Buffer.from(hashOrderCapability(token), "hex");
  const stored = Buffer.from(storedHash.toLowerCase(), "hex");
  if (presented.length !== stored.length) return false;
  return crypto.timingSafeEqual(presented, stored);
}

/**
 * Mint a single-use exchange code for the email recovery link.
 *
 * Same shape and entropy as the capability, but stored in its own slot so that
 * redeeming it cannot disturb the cookie the checkout browser already holds —
 * both entry points stay independently valid.
 */
export function createExchangeCode(): {
  code: string;
  hash: string;
  expiresAt: number;
} {
  const { token, hash } = createOrderCapability();
  return { code: token, hash, expiresAt: Date.now() + EXCHANGE_TTL_MS };
}

/** Reads the stored exchange-code hash off an order's billingDetails JSON. */
export function guestPaymentExchangeHash(
  billingDetails: unknown,
): string | null {
  return readHashKey(billingDetails, EXCHANGE_HASH_KEY);
}

/** Reads the stored exchange-code expiry off an order's billingDetails JSON. */
export function guestPaymentExchangeExpiresAt(
  billingDetails: unknown,
): number | null {
  if (!billingDetails || typeof billingDetails !== "object") return null;
  const value = (billingDetails as Record<string, unknown>)[EXCHANGE_EXPIRY_KEY];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads the exchange slot's explicit lifecycle state, or null when unset. */
export function guestPaymentExchangeState(
  billingDetails: unknown,
): string | null {
  if (!billingDetails || typeof billingDetails !== "object") return null;
  const value = (billingDetails as Record<string, unknown>)[EXCHANGE_STATE_KEY];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Verify a presented exchange code against its stored hash and expiry.
 * Returns false — never throws — for any malformed, unknown, expired or already
 * redeemed code, so callers cannot distinguish the failure modes.
 */
export function verifyOrderExchange(
  code: unknown,
  billingDetails: unknown,
  now: number = Date.now(),
): boolean {
  // Fail closed on absent state: only a slot still marked redeemable can be spent.
  if (guestPaymentExchangeState(billingDetails) !== EXCHANGE_STATE_REDEEMABLE) {
    return false;
  }
  const expiresAt = guestPaymentExchangeExpiresAt(billingDetails);
  if (expiresAt === null || expiresAt <= now) return false;
  return verifyOrderCapability(code, guestPaymentExchangeHash(billingDetails));
}

/**
 * Verify the payment-cookie capability for an order.
 *
 * Two hashes can authorise a payment: the one minted at create-order (the
 * checkout browser) and the one minted when an email exchange code was redeemed
 * (any other browser). Checking both is what keeps the post-checkout redirect and
 * the emailed link independently valid — redeeming one never invalidates the
 * other.
 *
 * The exchange slot only counts once it has been redeemed, which the explicit
 * state key states outright. Anything else — absent state, `redeemable`, an
 * unrecognised value, or an order with no exchange data at all — leaves the slot
 * inert. Without that gate the un-redeemed code — a value that has been in a URL,
 * an inbox and a proxy log — would be accepted as a payment credential, and the
 * interstitial would buy nothing.
 *
 * The expiry is deliberately NOT compared against the clock here: after
 * redemption the slot holds a plain capability, and the cookie's own maxAge
 * bounds how long the browser keeps presenting it.
 */
export function verifyOrderPayCookie(
  token: unknown,
  billingDetails: unknown,
): boolean {
  if (verifyOrderCapability(token, guestPaymentTokenHash(billingDetails))) {
    return true;
  }
  return (
    guestPaymentExchangeState(billingDetails) === EXCHANGE_STATE_REDEEMED &&
    verifyOrderCapability(token, guestPaymentExchangeHash(billingDetails))
  );
}

/**
 * Copy of billingDetails with the redeemed exchange code replaced by the hash of
 * the freshly minted cookie capability.
 *
 * Overwriting the hash and flipping the state is what enforces single-use — a
 * replayed code matches nothing — and it is the same rotation the create-order
 * replay path already relies on. The checkout browser's own capability hash is
 * left untouched, so redeeming the email link in a second browser does not lock
 * the first one out.
 *
 * Kept as a pure function so the shape is unit-testable; the route applies it
 * atomically via `claimExchangeRedemption`, which writes the same three keys in
 * one guarded UPDATE rather than replacing this whole document from a stale
 * read.
 */
export function withRedeemedExchange(
  billingDetails: unknown,
  newCapabilityHash: string,
): Record<string, unknown> {
  const copy: Record<string, unknown> =
    billingDetails && typeof billingDetails === "object"
      ? { ...(billingDetails as Record<string, unknown>) }
      : {};
  delete copy[EXCHANGE_EXPIRY_KEY];
  copy[EXCHANGE_HASH_KEY] = newCapabilityHash;
  copy[EXCHANGE_STATE_KEY] = EXCHANGE_STATE_REDEEMED;
  return copy;
}

/** Reads a hash-shaped string out of billingDetails, or null when absent. */
function readHashKey(billingDetails: unknown, key: string): string | null {
  if (!billingDetails || typeof billingDetails !== "object") return null;
  const value = (billingDetails as Record<string, unknown>)[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Reads the stored capability hash off an order's billingDetails JSON. */
export function guestPaymentTokenHash(
  billingDetails: unknown,
): string | null {
  return readHashKey(billingDetails, GUEST_TOKEN_HASH_KEY);
}

/** Canonical order-number form shared by the payment routes. */
export function normalizeOrderNumber(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.replace(/[\s-]+/g, "").toUpperCase();
  return /^[A-Z0-9]{4,20}$/.test(value) ? value : null;
}

/**
 * Reads a 43-char base64url token from a URL search param or a cookie value,
 * tolerating junk input. Shared by the cookie and the `code` exchange param
 * because both carry the same encoding.
 */
export function readCapabilityParam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  // base64url of 32 bytes
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}