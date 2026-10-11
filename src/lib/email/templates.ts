/**
 * Resend-managed email templates — configuration and pure payload builders.
 *
 * Four transactional emails can be rendered by a template published in the
 * Resend dashboard instead of the inline HTML this codebase has always used:
 *
 *   password reset, contact-inquiry admin notification, shop paid-order
 *   confirmation, mods (SERVICE) paid-order confirmation.
 *
 * The application stays the authority for everything the template must not own:
 * data retrieval, validation, recipient selection, authorisation, payment
 * verification, idempotency, retry classification, notification state
 * transitions and HTML escaping. A Resend template only decides layout and text;
 * it receives already-decided values as variables.
 *
 * WHY THIS IS PURE
 * ────────────────
 * Like `@/lib/email/outbound-policy`, this module takes the environment as a
 * plain map and reads nothing at import time, so the variable builders and the
 * "configured or fall back" rule can be unit-tested without a network.
 *
 * TEMPLATE IDS ARE NOT INVENTED
 * ─────────────────────────────
 * No template exists in the Resend account yet. Each id is read from an optional
 * environment variable (see `EMAIL_TEMPLATE_ENV`). When a variable is unset the
 * send falls back to the inline HTML (`html`), so production and local behaviour
 * are unchanged until an operator publishes a template and sets its id. See
 * `docs/resend-templates.md` for the exact dashboard steps.
 *
 * VARIABLES
 * ─────────
 * Resend's send API accepts only flat `string | number` variables (no arrays or
 * objects). List-shaped content (order items, mods configuration, service lines,
 * photos) is therefore pre-rendered in the application into an escaped HTML
 * fragment and passed as a single `*Html` variable. Text variables carry the raw
 * value; `*Html` variables are already HTML-escaped with `esc()` and must be
 * inserted without further escaping. `resetUrl` is a trusted, Better-Auth
 * generated URL (never user input) and is passed through unchanged.
 */

export const EMAIL_TEMPLATE_ENV = {
  passwordReset: "RESEND_TEMPLATE_PASSWORD_RESET",
  contactInquiry: "RESEND_TEMPLATE_CONTACT_INQUIRY",
  shopOrderPaid: "RESEND_TEMPLATE_SHOP_ORDER_PAID",
  modsOrderPaid: "RESEND_TEMPLATE_MODS_ORDER_PAID",
} as const;

export type EmailTemplateKey = keyof typeof EMAIL_TEMPLATE_ENV;

export type EmailTemplateIds = Partial<Record<EmailTemplateKey, string>>;

/** The `template` object Resend's `emails.send` expects. */
export type EmailTemplateRef = {
  id: string;
  variables: Record<string, string | number>;
};

/**
 * Read the configured template ids from the environment.
 *
 * Trims whitespace and treats an empty (or non-string) value as unconfigured, so
 * a blank variable degrades to the inline-HTML fallback rather than sending a
 * request with an empty id.
 */
export function readTemplateIds(
  env: Record<string, string | undefined> = process.env,
): EmailTemplateIds {
  const ids: EmailTemplateIds = {};
  for (const key of Object.keys(EMAIL_TEMPLATE_ENV) as EmailTemplateKey[]) {
    const raw = env[EMAIL_TEMPLATE_ENV[key]];
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed.length > 0) ids[key] = trimmed;
  }
  return ids;
}

/**
 * Escape every HTML metacharacter before a value becomes markup.
 *
 * Canonical escaper for outbound email; `@/lib/notifications/paid-confirmation`
 * re-exports it so the existing call sites and tests keep a single definition.
 */
export function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}

/** A rendered message: an inline-HTML fallback plus an optional template. */
export type EmailPayload = {
  subject: string;
  html: string;
  template?: EmailTemplateRef;
};

/**
 * Password reset. Better Auth generates the token and the `resetUrl` (derived
 * from its configured `baseURL` — https://keebforge.in in production, localhost
 * only in development); this only frames the message. The token is never
 * generated or read here, and only the reset URL is handed to the template.
 */
export function passwordResetEmail(
  input: { name: string; resetUrl: string },
  templateId?: string,
): EmailPayload {
  const subject = "Reset your KeebForge password";
  const html =
    `<h2>Reset your password — KeebForge.in</h2>` +
    `<p>Hi ${esc(input.name)},</p>` +
    `<p>We received a request to reset your password. Tap the button below to choose a new one. This link expires in 1 hour.</p>` +
    `<p style="margin:24px 0"><a href="${esc(input.resetUrl)}" style="display:inline-block;padding:12px 20px;background:#a3e635;color:#0a0a0a;border-radius:10px;text-decoration:none;font-weight:600">Reset password</a></p>` +
    `<p>If you didn't request this, you can safely ignore this email — your password won't change.</p>`;

  return {
    subject,
    html,
    template: templateId
      ? {
          id: templateId,
          variables: {
            name: input.name,
            resetUrl: input.resetUrl,
            expiresIn: "1 hour",
          },
        }
      : undefined,
  };
}

/**
 * Contact-inquiry admin notification. The recipient (the shared contact inbox)
 * and the reply-to behaviour are decided by the caller; this only builds the
 * body. The optional uploaded-photo links are pre-rendered into an escaped
 * `photosHtml` fragment so the template can insert them raw.
 */
export function contactInquiryEmail(
  input: {
    name: string;
    phone: string;
    email: string;
    deviceModel: string;
    issue: string;
    photoUrls: string[];
  },
  templateId?: string,
): EmailPayload {
  const subject = `Repair Inquiry — ${input.deviceModel || "Device"} — ${input.name}`;
  const photosHtml =
    input.photoUrls.length > 0
      ? `<h3>Photos (${input.photoUrls.length})</h3>` +
        input.photoUrls
          .map((url) => `<p><a href="${esc(url)}">${esc(url)}</a></p>`)
          .join("")
      : "";
  const rows: Array<[string, string]> = [
    ["Name", input.name],
    ["Phone", input.phone],
    ["Email", input.email],
    ["Device / Model", input.deviceModel],
    ["Issue", input.issue],
  ];
  const html =
    `<h2>Repair Inquiry — KeebForge.in</h2>` +
    `<table cellpadding="6" style="font-family:sans-serif;font-size:14px;color:#1a1a1a">` +
    rows
      .map(
        ([key, value]) =>
          `<tr><td><strong>${esc(key)}</strong></td><td>${esc(value)}</td></tr>`,
      )
      .join("") +
    `</table>` +
    photosHtml +
    `<p style="color:#888">Reply to this inquiry by clicking Reply — it goes straight back to the customer.</p>`;

  return {
    subject,
    html,
    template: templateId
      ? {
          id: templateId,
          variables: {
            name: input.name,
            phone: input.phone,
            email: input.email,
            deviceModel: input.deviceModel,
            issue: input.issue,
            photosCount: input.photoUrls.length,
            photosHtml,
          },
        }
      : undefined,
  };
}
