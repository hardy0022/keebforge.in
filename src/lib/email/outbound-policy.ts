/**
 * Shared outbound-email recipient policy.
 *
 * Every path that hands a message to Resend (transactional confirmations, auth
 * mail, internal form notifications) resolves its recipient through this
 * module first, so a single pair of environment switches can never be bypassed
 * by one forgotten call site.
 *
 * Two settings, both server-only and both optional:
 *
 *   EMAIL_SEND_DISABLED   truthy (1/true/on/yes) → suppress every outbound send.
 *   EMAIL_TEST_RECIPIENT  when set, every message is redirected to this single
 *                         address instead of the real recipient.
 *
 * Safety rules, chosen so a mistake fails closed rather than mailing a real
 * customer:
 *
 *   - A suppression sentinel (SUPPRESS/DISABLED/OFF/NONE) in
 *     EMAIL_TEST_RECIPIENT is treated as suppression, never as an address.
 *   - An override that is not a plausible address is refused — the send is
 *     skipped, never silently downgraded back to the real recipient.
 *   - Suppression wins over an override; setting both is contradictory and also
 *     skips the send.
 *   - With neither setting present the recipient is passed through unchanged,
 *     so production behaviour is identical to before.
 *
 * This module is deliberately pure: it takes the environment as a plain map and
 * reads nothing at import time. The server-only entry point is
 * `@/lib/email/outbound`, which supplies the real process environment.
 */

export const OUTBOUND_TEST_RECIPIENT_ENV = "EMAIL_TEST_RECIPIENT";
export const OUTBOUND_SEND_DISABLED_ENV = "EMAIL_SEND_DISABLED";

export type OutboundEnv = Record<string, string | undefined>;

export type OutboundSkipReason =
  | "disabled"
  | "contradictory"
  | "invalid-override";

export type OutboundPlan =
  | { action: "send"; to: string; redirected: boolean }
  | { action: "skip"; reason: OutboundSkipReason };

const TRUTHY = new Set(["1", "true", "on", "yes"]);

/** Case-insensitive values that mean "suppress", never an address. */
const SUPPRESS_SENTINELS = new Set(["SUPPRESS", "DISABLED", "OFF", "NONE"]);

function isEnabledFlag(raw: string | undefined): boolean {
  return raw !== undefined && TRUTHY.has(raw.trim().toLowerCase());
}

function readOverride(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Conservative single-address check. Rejects whitespace (so CRLF/header
 * injection and comma-separated lists cannot slip through) and any value that
 * is not exactly `local@domain.tld`.
 */
export function isDeliverableAddress(value: string): boolean {
  if (value.length === 0 || value.length > 254) return false;
  if (/\s/.test(value)) return false;
  // No angle brackets/quotes/separators or control characters: this field is a
  // single plain address, not a display name or a recipient list.
  if (/[<>()[\]\\,;:"]/.test(value)) return false;
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const domain = value.slice(at + 1);
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Decide where a message for `originalTo` should actually go.
 *
 * Returns `{ action: "send", to, redirected }` to deliver, or
 * `{ action: "skip", reason }` to suppress. Never returns the override as a
 * recipient unless it is a valid address.
 */
export function planOutboundRecipient(
  originalTo: string,
  env: OutboundEnv = {},
): OutboundPlan {
  const disabled = isEnabledFlag(env[OUTBOUND_SEND_DISABLED_ENV]);
  const override = readOverride(env[OUTBOUND_TEST_RECIPIENT_ENV]);

  if (disabled && override !== null) {
    return { action: "skip", reason: "contradictory" };
  }
  if (disabled) {
    return { action: "skip", reason: "disabled" };
  }
  if (override === null) {
    return { action: "send", to: originalTo, redirected: false };
  }
  if (SUPPRESS_SENTINELS.has(override.toUpperCase())) {
    return { action: "skip", reason: "disabled" };
  }
  if (!isDeliverableAddress(override)) {
    return { action: "skip", reason: "invalid-override" };
  }
  return { action: "send", to: override, redirected: true };
}
