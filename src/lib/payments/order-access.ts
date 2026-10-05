import "server-only";
import { cookies } from "next/headers";
import {
  PAY_COOKIE,
  PAY_COOKIE_MAX_AGE,
  readCapabilityParam,
  verifyOrderPayCookie,
} from "@/lib/payments/order-capability";

/**
 * The order-scoped payment capability cookie.
 *
 * The capability itself is unchanged (same 43-char token, same stored hash) —
 * only the transport moved. It used to ride in `?pay=`, where it landed in the
 * address bar, browser history, Referer headers and Razorpay's risk-detection
 * bundle. Now it is delivered via `Set-Cookie` as HttpOnly, which also means no
 * analytics SDK, GTM container or client component can ever read it.
 */

/** Attributes for the payment cookie. Mirrors the cart cookie exactly. */
export function payCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PAY_COOKIE_MAX_AGE,
  };
}

/**
 * Reads the payment capability off the current request's cookies, or null when
 * absent/malformed. Never throws, so a hostile cookie value degrades to
 * "unauthorized" rather than a 500.
 */
export async function readPayCookie(): Promise<string | null> {
  try {
    const raw = (await cookies()).get(PAY_COOKIE)?.value;
    return readCapabilityParam(raw);
  } catch {
    return null;
  }
}

/**
 * True when this browser holds the capability for `billingDetails`' order. Used
 * by the success page and track-order for rendering decisions only — the
 * pay-inline API re-verifies independently and is the actual authorization
 * boundary.
 */
export async function canPayFromCookie(
  billingDetails: unknown,
): Promise<boolean> {
  const token = await readPayCookie();
  if (!token) return false;
  return verifyOrderPayCookie(token, billingDetails);
}