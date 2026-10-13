import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  EMAIL_SETTING_KEYS,
  EMAIL_TYPES,
  emailSettingKey,
  planEmailSend,
  type EmailSettings,
  type EmailSettingsRead,
  type EmailType,
} from "@/lib/email/email-policy";

/**
 * Server-only reader for the per-email-type sending toggles.
 *
 * Reads the `SiteSetting` rows directly (no cache) so an admin toggle takes
 * effect on the very next send. Failures are swallowed: `canSendEmail` must
 * never throw, because a settings hiccup must not take down sign-up, password
 * reset or paid-order confirmation. See `@/lib/email/email-policy` for the
 * fail-open/fail-closed defaults applied on a failed read.
 */

/** All currently-stored email toggles plus whether the read itself failed. */
export async function readEmailSettings(): Promise<EmailSettingsRead> {
  try {
    const rows = await prisma.siteSetting.findMany({
      where: { key: { in: [...EMAIL_SETTING_KEYS] } },
      select: { key: true, value: true },
    });
    const settings: EmailSettings = {};
    for (const row of rows) {
      const type = EMAIL_TYPES.find((t) => emailSettingKey(t) === row.key);
      if (type && typeof row.value === "boolean") settings[type] = row.value;
    }
    return { settings, readFailed: false };
  } catch (e) {
    console.error(
      "[email] could not read email notification settings; using defaults:",
      e,
    );
    return { settings: {}, readFailed: true };
  }
}

/**
 * The central gate every outbound Resend path calls immediately before it
 * attempts a real send. Never throws.
 */
export async function canSendEmail(type: EmailType): Promise<boolean> {
  const { settings, readFailed } = await readEmailSettings();
  return planEmailSend(type, settings, readFailed);
}
