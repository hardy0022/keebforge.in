/**
 * Resend-managed email templates — configuration and pure payload builders.
 *
 * Every transactional email is rendered by a template published in the Resend
 * dashboard rather than inline HTML in this codebase:
 *
 *   password reset, email verification, contact-inquiry admin notification,
 *   custom-work/repair-request admin notification, shop paid-order
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
 * "configured or not" rule can be unit-tested without a network.
 *
 * TEMPLATE IDS
 * ────────────
 * Each id is read from a required environment variable (see `EMAIL_TEMPLATE_ENV`).
 * A published template's id is set by the operator (see docs/resend-templates.md).
 * When an id is unset the call site cannot render that email and reports the
 * failure rather than inventing a template.
 *
 * VARIABLES
 * ─────────
 * Resend's send API accepts only flat `string | number` variables (no arrays or
 * objects). List-shaped content (order items, mods configuration, service lines,
 * photos) is therefore pre-rendered in the application into an escaped HTML
 * fragment and passed as a single `*Html` variable. Resend inserts `{{{KEY}}}`
 * values without escaping, so `*Html` variables are HTML-escaped here with
 * `esc()` before they are handed over. `resetUrl`/`verifyUrl` are trusted,
 * Better-Auth generated URLs (never user input) and are passed through
 * unchanged.
 *
 * `EMAIL`, `FIRST_NAME`, `LAST_NAME`, `UNSUBSCRIBE_URL`, `contact` and `this` are
 * reserved by Resend; no variable key here collides with them.
 */

export const EMAIL_TEMPLATE_ENV = {
  passwordReset: "RESEND_TEMPLATE_PASSWORD_RESET",
  emailVerification: "RESEND_TEMPLATE_EMAIL_VERIFICATION",
  contactInquiry: "RESEND_TEMPLATE_CONTACT_INQUIRY",
  repairRequest: "RESEND_TEMPLATE_REPAIR_REQUEST",
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
 * a blank variable is a hard "not configured" rather than a request with an
 * empty id.
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

/** A rendered message: the subject plus the template variables to send. */
export type EmailPayload = {
  subject: string;
  variables: Record<string, string | number>;
};

/** Combine a template id with a built payload into Resend's `template` shape. */
export function templateRef(
  id: string,
  payload: EmailPayload,
): { subject: string; template: EmailTemplateRef } {
  return { subject: payload.subject, template: { id, variables: payload.variables } };
}

/**
 * Password reset. Better Auth generates the token and the `resetUrl` (derived
 * from its configured `baseURL` — https://keebforge.in in production, localhost
 * only in development); this only frames the message. The token is never
 * generated or read here, and only the reset URL is handed to the template.
 */
export function passwordResetEmail(input: {
  name: string;
  resetUrl: string;
}): EmailPayload {
  return {
    subject: "Reset your KeebForge password",
    variables: {
      name: input.name,
      resetUrl: input.resetUrl,
      expiresIn: "1 hour",
    },
  };
}

/**
 * Email verification. Better Auth generates the token and the `verifyUrl`; this
 * only frames the message. The token is never generated or read here.
 */
export function verificationEmail(input: {
  name: string;
  verifyUrl: string;
}): EmailPayload {
  return {
    subject: "Verify your KeebForge email",
    variables: {
      name: input.name,
      verifyUrl: input.verifyUrl,
      expiresIn: "1 hour",
    },
  };
}

/**
 * Contact-inquiry admin notification. The recipient (the shared contact inbox)
 * and the reply-to behaviour are decided by the caller; this only builds the
 * variables. The optional uploaded-photo links are pre-rendered into an escaped
 * `photosHtml` fragment so the template can insert them raw. `customerEmail` is
 * the inquiry sender's address (not a recipient); the key avoids Resend's
 * reserved `EMAIL`.
 */
export function contactInquiryEmail(input: {
  name: string;
  phone: string;
  email: string;
  deviceModel: string;
  issue: string;
  photoUrls: string[];
}): EmailPayload {
  const photosHtml =
    input.photoUrls.length > 0
      ? `<p style="margin:24px 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Photos (${input.photoUrls.length})</p>` +
        input.photoUrls
          .map(
            (url) =>
              `<p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;"><a href="${esc(url)}" style="color:#4d7c0f;">${esc(url)}</a></p>`,
          )
          .join("")
      : "";

  return {
    subject: `Repair Inquiry — ${input.deviceModel || "Device"} — ${input.name}`,
    variables: {
      name: input.name,
      phone: input.phone,
      customerEmail: input.email,
      deviceModel: input.deviceModel,
      issue: input.issue,
      photosCount: input.photoUrls.length,
      photosHtml,
    },
  };
}

/**
 * Custom-work / repair-request admin notification. Mirrors the previous inline
 * table as flat template variables; the uploaded-photo links are pre-rendered
 * into an escaped `photosHtml` fragment.
 */
export function repairRequestEmail(input: {
  reference: string;
  serviceType: string;
  deviceType: string;
  brand: string;
  model: string;
  workTypes: string;
  condition: string;
  budget: string;
  description: string;
  name: string;
  phone: string;
  email: string;
  contactNotes: string;
  shipping: string;
  photoUrls: string[];
}): EmailPayload {
  const photosHtml =
    input.photoUrls.length > 0
      ? `<p style="margin:24px 0 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#71717a;">Photos (${input.photoUrls.length})</p>` +
        input.photoUrls
          .map(
            (url) =>
              `<p style="margin:0 0 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;"><a href="${esc(url)}" style="color:#4d7c0f;">${esc(url)}</a></p>`,
          )
          .join("")
      : "";

  return {
    subject: `[${input.reference}] Custom Work & Repair Request — ${input.brand} ${input.model}`,
    variables: {
      reference: input.reference,
      serviceType: input.serviceType,
      deviceType: input.deviceType,
      brand: input.brand,
      model: input.model,
      workTypes: input.workTypes,
      condition: input.condition,
      budget: input.budget,
      description: input.description,
      name: input.name,
      phone: input.phone,
      customerEmail: input.email,
      contactNotes: input.contactNotes,
      shipping: input.shipping,
      photosCount: input.photoUrls.length,
      photosHtml,
    },
  };
}
