/**
 * Friendly copy for email/password sign-up failures.
 *
 * Better Auth returns `{ error: { ...body, status, statusText } }` from the
 * non-throw client path. `body` may carry an internal `code` and a raw
 * `message`, but the message is library/provider text and must never be
 * rendered. `registrationErrorMessage` maps only the status and the known
 * allow-listed codes onto copy written for end users; everything else falls
 * through to the generic retry message.
 *
 * The Sentinel security plugin is intentionally NOT bypassed here: PoW
 * challenges (`POW_CHALLENGE_REQUIRED` / 423) and blocks (403) are explained,
 * not suppressed.
 */

export const REGISTER_ERROR_MESSAGES = {
  duplicate:
    "An account with this email already exists. Try signing in instead.",
  invalidEmail: "Please enter a valid email address.",
  invalidPassword: "Please choose a password that meets all the requirements.",
  invalidInput: "Please check the details you entered and try again.",
  breachedPassword:
    "That password has appeared in a data breach. Please choose a different one.",
  securityChallenge: "Please complete the security check and try again.",
  securityBlocked:
    "We couldn't complete your request for security reasons. Please try again later or contact support.",
  temporary: "Unable to create your account right now. Please try again.",
} as const;

/** Password-policy rejections that all read the same to a user. */
const PASSWORD_CODES: ReadonlySet<string> = new Set([
  "PASSWORD_TOO_SHORT",
  "PASSWORD_TOO_LONG",
  "INVALID_PASSWORD",
]);

/**
 * Parses a `Retry-After` / `x-retry-after` value into whole seconds.
 *
 * Only a positive, finite value is accepted; it is clamped to 1..3600 so a
 * hostile or missing header can never produce a huge or nonsensical wait, and
 * anything unparseable yields `null` (caller falls back to "wait a moment").
 */
export function readRetryAfterSeconds(value: unknown): number | null {
  let raw: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    raw = value;
  } else if (
    typeof value === "string" &&
    /^\d+(\.\d+)?$/.test(value.trim())
  ) {
    raw = Number(value);
  }
  if (raw === null || raw <= 0) return null;
  return Math.min(3600, Math.max(1, Math.ceil(raw)));
}

function statusOf(error: Record<string, unknown>): number | null {
  const value = error.status;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() !== "" &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return null;
}

function codeOf(error: Record<string, unknown>): string | null {
  return typeof error.code === "string" ? error.code : null;
}

/** "Too many attempts…" with the wait filled in only when a valid one exists. */
export function tooManyAttemptsMessage(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds !== null && retryAfterSeconds > 0) {
    const unit = retryAfterSeconds === 1 ? "second" : "seconds";
    return `Too many attempts. Please wait ${retryAfterSeconds} ${unit} and try again.`;
  }
  return "Too many attempts. Please wait a moment and try again.";
}

/**
 * Maps a Better Auth sign-up error onto safe, user-facing copy.
 *
 * Ordering matters: `FAILED_TO_CREATE_USER` is a transient user-creation
 * failure that Better Auth can return with a 422, so the code is checked
 * before the generic 422→duplicate rule; otherwise a temporary DB failure would
 * be reported as "email already exists". An explicit retry interval may be
 * passed as the second argument (e.g. read from the `x-retry-after` header),
 * falling back to any `retryAfter` field on the error object.
 */
export function registrationErrorMessage(
  error: unknown,
  retryAfter?: unknown,
): string {
  if (typeof error !== "object" || error === null) {
    return REGISTER_ERROR_MESSAGES.temporary;
  }
  const e = error as Record<string, unknown>;
  const status = statusOf(e);
  const code = codeOf(e);

  if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
    return REGISTER_ERROR_MESSAGES.duplicate;
  }
  if (status === 409) return REGISTER_ERROR_MESSAGES.duplicate;
  if (code === "FAILED_TO_CREATE_USER") {
    return REGISTER_ERROR_MESSAGES.temporary;
  }
  if (status === 422) return REGISTER_ERROR_MESSAGES.duplicate;
  if (code === "COMPROMISED_PASSWORD") {
    return REGISTER_ERROR_MESSAGES.breachedPassword;
  }
  if (code !== null && PASSWORD_CODES.has(code)) {
    return REGISTER_ERROR_MESSAGES.invalidPassword;
  }
  if (code === "INVALID_EMAIL") return REGISTER_ERROR_MESSAGES.invalidEmail;
  if (code === "POW_CHALLENGE_REQUIRED" || status === 423) {
    return REGISTER_ERROR_MESSAGES.securityChallenge;
  }
  if (status === 429) {
    return tooManyAttemptsMessage(
      readRetryAfterSeconds(retryAfter ?? e.retryAfter),
    );
  }
  if (status === 403) return REGISTER_ERROR_MESSAGES.securityBlocked;
  if (status === 400) return REGISTER_ERROR_MESSAGES.invalidInput;
  return REGISTER_ERROR_MESSAGES.temporary;
}
