/**
 * Sanitized, PII-free diagnostics for Resend failures.
 *
 * A Resend error carries a `message` that can echo the request payload (the
 * recipient address, subject, even a recovery token). Nothing here may ever read
 * `message` — only the stable machine fields `name` and `statusCode`, both
 * whitelisted to a safe alphabet. The output is short enough to store in
 * `OrderNotification.lastError` and safe to log.
 */

/** A resend `{ name, statusCode }` diagnostic. Never contains free text. */
export function resendErrorDiagnostic(error: unknown): string {
  if (!error || typeof error !== "object") return "resend:unknown";
  const e = error as { name?: unknown; statusCode?: unknown };
  const name =
    typeof e.name === "string" && /^[a-zA-Z0-9_]+$/.test(e.name)
      ? e.name
      : "unknown";
  const status =
    typeof e.statusCode === "number" && Number.isFinite(e.statusCode)
      ? String(e.statusCode)
      : "na";
  return `resend:${name}:${status}`;
}

/**
 * Split a Resend *API-level* rejection from an ambiguous failure.
 *
 * Resend returns `{ error }` (it does not throw) for a response it could give a
 * status for. A 4xx is a definitive rejection — the message was not accepted, so
 * an explicit retry is safe. A 5xx (or a status-less error) is ambiguous: the
 * request may have been accepted before the response was lost, so it must not be
 * auto-retried.
 */
export function classifyResendApiError(
  error: unknown,
): "rejected" | "ambiguous" {
  if (error && typeof error === "object") {
    const code = (error as { statusCode?: unknown }).statusCode;
    if (typeof code === "number" && code >= 400 && code < 500) {
      return "rejected";
    }
  }
  return "ambiguous";
}
