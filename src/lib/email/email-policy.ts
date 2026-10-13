/**
 * Pure core for the per-email-type sending toggles.
 *
 * This is the FIRST gate every outbound mail path consults, ahead of the
 * recipient/suppression policy in `@/lib/email/outbound-policy`. Keeping the
 * decision logic dependency-free (no Prisma, no `server-only`) lets it be unit
 * tested directly and reused by both the admin UI (labels) and the server
 * reader (`@/lib/email/email-settings`).
 *
 * Behaviour when nothing is configured: every type defaults to ENABLED, so
 * shipping this feature changes nothing until an admin turns a toggle off.
 *
 * Behaviour when the settings row cannot be read: account/order-critical mail
 * fails OPEN (still sends) so a transient read error can never stop a password
 * reset or a paid-order confirmation, while the optional admin-notification
 * emails fail CLOSED (skip) so a read error cannot silently resume mail the
 * admin may have disabled.
 */

export const EMAIL_TYPES = [
  "passwordReset",
  "emailVerification",
  "contactInquiry",
  "repairRequest",
  "shopOrderPaid",
  "modsOrderPaid",
  "guestOrderConfirmation",
] as const;

export type EmailType = (typeof EMAIL_TYPES)[number];

export function isEmailType(value: unknown): value is EmailType {
  return (
    typeof value === "string" &&
    (EMAIL_TYPES as readonly string[]).includes(value)
  );
}

/** `SiteSetting` key prefix for this feature. */
export const EMAIL_SETTING_PREFIX = "emailNotifications.";

export function emailSettingKey(type: EmailType): string {
  return `${EMAIL_SETTING_PREFIX}${type}`;
}

export const EMAIL_SETTING_KEYS: readonly string[] = EMAIL_TYPES.map(
  emailSettingKey,
);

/** Human labels, used by the admin action messages and the settings card. */
export const EMAIL_LABELS: Record<EmailType, string> = {
  passwordReset: "Password reset",
  emailVerification: "Email verification",
  contactInquiry: "Contact inquiry",
  repairRequest: "Repair request",
  shopOrderPaid: "Shop order confirmation",
  modsOrderPaid: "Mods order confirmation",
  guestOrderConfirmation: "Guest order confirmation",
};

/**
 * Email types that must never be disabled.
 *
 * `passwordReset` is REQUIRED for account recovery, and the two paid-order
 * confirmations are CORE: disabling them silently stops paying customers from
 * receiving their receipt, so they are locked ON. Enforcement lives in the
 * server action (`toggleEmailNotification`) — the UI only hides the control —
 * so a stale form or direct POST cannot turn them off either.
 */
export const EMAIL_LOCKED_TYPES = [
  "passwordReset",
  "shopOrderPaid",
  "modsOrderPaid",
] as const satisfies readonly EmailType[];

export function isEmailTypeLocked(type: EmailType): boolean {
  return (EMAIL_LOCKED_TYPES as readonly string[]).includes(type);
}

/**
 * Effective setting when a `SiteSetting` row is simply absent. All true so the
 * feature is invisible until deliberately configured.
 */
export const EMAIL_DEFAULT_ENABLED: Record<EmailType, boolean> = {
  passwordReset: true,
  emailVerification: true,
  contactInquiry: true,
  repairRequest: true,
  shopOrderPaid: true,
  modsOrderPaid: true,
  guestOrderConfirmation: true,
};

/**
 * Fallback when the settings lookup itself fails. Account/order-critical mail
 * stays on; optional admin notifications stay off.
 */
export const EMAIL_FAILURE_DEFAULT: Record<EmailType, boolean> = {
  passwordReset: true,
  emailVerification: true,
  contactInquiry: false,
  repairRequest: false,
  shopOrderPaid: true,
  modsOrderPaid: true,
  guestOrderConfirmation: true,
};

/** Stored per-type values (only the keys that are actually persisted). */
export type EmailSettings = Partial<Record<EmailType, boolean>>;

export type EmailSettingsRead = {
  settings: EmailSettings;
  readFailed: boolean;
};

/**
 * The single decision shared by every send path and the admin UI: may this
 * email type be sent?
 */
export function planEmailSend(
  type: EmailType,
  settings: EmailSettings,
  readFailed = false,
): boolean {
  if (readFailed) return EMAIL_FAILURE_DEFAULT[type];
  const stored = settings[type];
  return typeof stored === "boolean" ? stored : EMAIL_DEFAULT_ENABLED[type];
}

/** Resolve an already-read settings snapshot into a display boolean. */
export function resolveEmailEnabled(
  type: EmailType,
  read: EmailSettingsRead,
): boolean {
  return planEmailSend(type, read.settings, read.readFailed);
}
