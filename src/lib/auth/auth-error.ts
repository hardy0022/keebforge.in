/**
 * The single source of truth for which OAuth/auth error codes the site is
 * willing to surface, and the copy shown for each.
 *
 * Better Auth redirects to `/auth/error?error=<code>[&error_description=<raw
 * provider text>]` on any callback failure. The description is verbatim
 * upstream text (Google's wording, or a library-internal sentence) and must
 * never reach rendered HTML or an RSC payload — `decideAuthErrorHandling`
 * strips it, along with every code that is not explicitly on the allow list
 * below. Adding a code here is therefore a deliberate act of publishing that
 * code to end users, which is why `account_not_linked` was added only when
 * there was copy written for it.
 *
 * `account_not_linked` (Better Auth's `handleOAuthUserInfo`) fires when an
 * existing local/password account is presented through a social provider but
 * the local email is still unverified. It leaks nothing the signer does not
 * already know: they just attempted to sign in with Google on that address.
 */

/** Codes allowed to survive the proxy and reach /auth/error. */
export const SAFE_AUTH_ERROR_CODES: ReadonlySet<string> = new Set([
  "access_denied",
  "state_mismatch",
  "state_invalid",
  "account_not_linked",
]);

/**
 * What the proxy should do with an `/auth/error` request.
 *
 * `next` means the URL is already clean (a single safe code, or no params at
 * all) and the page can render it as-is. `redirect` means something unsafe was
 * attached: the query is dropped entirely, carrying over `code` only when the
 * code itself is on the allow list.
 */
export type AuthErrorDecision =
  | { action: "next" }
  | { action: "redirect"; code: string | null };

export function decideAuthErrorHandling(
  params: URLSearchParams,
): AuthErrorDecision {
  const code = params.get("error");
  const unsafe =
    params.has("error_description") ||
    params.size > 1 ||
    (code !== null && !SAFE_AUTH_ERROR_CODES.has(code));

  if (!unsafe) return { action: "next" };

  return {
    action: "redirect",
    code: code !== null && SAFE_AUTH_ERROR_CODES.has(code) ? code : null,
  };
}

export type AuthErrorMessage = { title: string; detail: string };

/** Friendly copy per allow-listed code. Raw codes/descriptions are never rendered. */
export const AUTH_ERROR_MESSAGES: Readonly<Record<string, AuthErrorMessage>> = {
  access_denied: {
    title: "Sign-in was cancelled",
    detail:
      "You cancelled the sign-in, or the provider denied access. You can try again.",
  },
  state_mismatch: {
    title: "Sign-in could not be verified",
    detail:
      "The sign-in request expired or is no longer valid. Please start again.",
  },
  state_invalid: {
    title: "Sign-in could not be verified",
    detail:
      "The sign-in request expired or is no longer valid. Please start again.",
  },
  account_not_linked: {
    title: "Verify your email first",
    detail:
      "Your email address is not verified yet. Please verify your email before signing in with Google. You can verify your email and try Google again, or continue with your email and password.",
  },
};

const GENERIC_AUTH_ERROR: AuthErrorMessage = {
  title: "Something went wrong",
  detail:
    "We couldn't complete your sign-in. Please try again or return to KeebForge.",
};

/**
 * Unknown/absent codes fall through to the generic message, so a code that is
 * allow-listed by the proxy but has no copy still cannot render library text.
 *
 * Own-property lookup only: `code in AUTH_ERROR_MESSAGES` would also match
 * `__proto__`/`constructor`/`toString` and hand back a non-copy object.
 */
export function resolveAuthErrorMessage(
  code: string | null | undefined,
): AuthErrorMessage {
  if (code && Object.hasOwn(AUTH_ERROR_MESSAGES, code)) {
    return AUTH_ERROR_MESSAGES[code]!;
  }
  return GENERIC_AUTH_ERROR;
}
