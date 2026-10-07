import { authClient } from "@/lib/auth/auth-client";

/**
 * Client-side resend of the email-verification link, used by /auth/error when
 * Google sign-in was refused for an unverified local account.
 *
 * WHY THE BUILT-IN ENDPOINT
 * ─────────────────────────
 * No new email-sending endpoint is introduced. The call goes to Better Auth's
 * own `POST /api/auth/send-verification-email`, which is the existing mechanism
 * and already carries the controls we need:
 *
 *  - rate limiting: Better Auth's default special rule matches this exact path
 *    at 3 requests / 60s per IP+path, and `rateLimit.enabled` defaults to on in
 *    production. This module does not touch that configuration.
 *  - no account enumeration: the handler always answers `{ status: true }` after
 *    a ≥500ms floor, whether or not the address exists or is already verified,
 *    and only the genuine "send failed" case differs — which is a truthful
 *    signal about delivery, not about the account.
 *  - existing config: same Resend key, sender, and template as sign-up.
 *
 * The stored secret, the provider's error text, and whether any account exists
 * are never surfaced: `resendVerificationEmail` maps every outcome onto one of
 * two fixed strings.
 */

export const VERIFICATION_RESEND_PATH = "/send-verification-email";

export const RESEND_SUCCESS_MESSAGE =
  "If that email needs verifying, a verification link is on its way. Check your inbox and spam folder.";
export const RESEND_FAILURE_MESSAGE =
  "We couldn't send the verification email right now. Please wait a moment and try again.";

export type ResendVerificationOutcome = {
  status: "success" | "error";
  message: string;
};

type Send = (email: string) => Promise<unknown>;

/** Default transport: the app's own Better Auth client, same origin. */
function defaultSend(email: string): Promise<unknown> {
  return authClient.$fetch(VERIFICATION_RESEND_PATH, {
    method: "POST",
    body: { email, callbackURL: "/auth/login" },
  });
}

/**
 * Sends a verification link and reports a UI-ready outcome.
 *
 * `send` is injectable so the success/failure mapping — and the guarantee that
 * provider text never leaks into `message` — can be tested without hitting the
 * network.
 */
export async function resendVerificationEmail(
  email: string,
  send: Send = defaultSend,
): Promise<ResendVerificationOutcome> {
  try {
    const res = (await send(email)) as { error?: unknown } | null | undefined;
    if (res && res.error) {
      return { status: "error", message: RESEND_FAILURE_MESSAGE };
    }
    return { status: "success", message: RESEND_SUCCESS_MESSAGE };
  } catch {
    return { status: "error", message: RESEND_FAILURE_MESSAGE };
  }
}
