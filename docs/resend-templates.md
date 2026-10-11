# Resend-managed email templates

KeebForge can render four transactional emails from templates published in the
Resend dashboard. Until a template is published **and its id is configured**,
each path falls back to the inline HTML that shipped before, so nothing changes
in production or local development.

The application remains the authority for data retrieval, validation, recipient
selection, payment verification, idempotency, retry classification, notification
state transitions and HTML escaping. A template only decides layout and copy.

> Status: **no template exists in the Resend account yet.** This document lists
> the manual work required. The code reads optional ids and does not invent any.

## 1. Templates and environment variables

Each template is enabled independently by setting the matching environment
variable to the id shown in the Resend dashboard (`templates` → your template →
the `id`). Leave it unset to keep the inline-HTML fallback.

| # | Email | Resend template (suggested name) | Environment variable |
|---|-------|----------------------------------|----------------------|
| 1 | Password reset | `keebforge-password-reset` | `RESEND_TEMPLATE_PASSWORD_RESET` |
| 2 | Contact inquiry (admin) | `keebforge-contact-inquiry` | `RESEND_TEMPLATE_CONTACT_INQUIRY` |
| 3 | Shop paid-order confirmation | `keebforge-shop-order-paid` | `RESEND_TEMPLATE_SHOP_ORDER_PAID` |
| 4 | Mods paid-order confirmation | `keebforge-mods-order-paid` | `RESEND_TEMPLATE_MODS_ORDER_PAID` |

Do **not** commit real template ids to the repository. Set them in the
deployment environment (Vercel) and, if needed locally, in `.env.local`.

Behaviour when a variable is unset, blank, or whitespace only: the inline HTML
fallback is sent. There is no error and no behaviour change.

## 2. Manual steps in the Resend dashboard

1. Sign in at <https://resend.com> and open **Templates**.
2. For each row in the table above: **Create template**, name it as suggested,
   and build the body using the variables listed in section 3.
3. Verify the sending domain `keebforge.in` is already verified (it is used by
   the existing `EMAIL_FROM` / `no-reply@keebforge.in` senders).
4. **Publish** the template (draft templates cannot be sent).
5. Copy the published template `id` and set the matching environment variable in
   the deployment environment. Redeploy/refresh so the server picks it up.
6. Send a test from the dashboard to confirm the variables render. Do not send a
   test to a real customer address.

## 3. Template variables

Resend's send API accepts only flat `string | number` variables. List-shaped
content is pre-rendered in the application into an **already HTML-escaped** HTML
fragment and passed as a single `*Html` variable. Those `*Html` variables must be
inserted **without** further escaping (raw/unescaped insertion). All other
variables are plain text and should be rendered as text.

### 3.1 Password reset (`RESEND_TEMPLATE_PASSWORD_RESET`)

| Variable | Type | Notes |
|----------|------|-------|
| `name` | string | Account holder's name (plain text). |
| `resetUrl` | string | **Trusted**, Better Auth generated reset URL. Use in an `href`. Never generate or edit this in the template. |
| `expiresIn` | string | Human-readable expiry, currently `1 hour`. |

The link must point at the URL supplied in `resetUrl` unchanged. The reset token
is generated and validated by Better Auth only; the template must never create a
token or reassemble the URL.

### 3.2 Contact inquiry (`RESEND_TEMPLATE_CONTACT_INQUIRY`)

| Variable | Type | Notes |
|----------|------|-------|
| `name` | string | Sender's name. |
| `phone` | string | Sender's phone. |
| `email` | string | Sender's email. |
| `deviceModel` | string | May be empty. |
| `issue` | string | Free-text description. |
| `photosCount` | number | Number of attached photos (0 when none). |
| `photosHtml` | HTML | Pre-escaped `<h3>` + linked photo URLs, or `""`. Insert unescaped. |

The recipient (the shared admin contact inbox) and reply-to behaviour are set by
the application and must not be changed by the template.

### 3.3 Shop paid-order confirmation (`RESEND_TEMPLATE_SHOP_ORDER_PAID`)

| Variable | Type | Notes |
|----------|------|-------|
| `orderNumber` | string | e.g. `KF-2026-000123`. |
| `customerName` | string | May be empty. |
| `amountPaid` | string | Formatted, e.g. `₹1,000` — derived from verified payment rows. |
| `itemsHtml` | HTML | Pre-escaped order-items table. Insert unescaped. |

### 3.4 Mods paid-order confirmation (`RESEND_TEMPLATE_MODS_ORDER_PAID`)

| Variable | Type | Notes |
|----------|------|-------|
| `orderNumber` | string | e.g. `KF-2026-000456`. |
| `customerName` | string | May be empty. |
| `amountPaid` | string | Formatted amount from verified payment rows. |
| `configHtml` | HTML | Pre-escaped configuration table (or a safe fallback row). Insert unescaped. |
| `servicesHtml` | HTML | Pre-escaped services table (or a safe fallback row). Insert unescaped. |
| `shippingMethod` | string | e.g. `You ship your device to KeebForge (Express)`. |
| `shippingAddress` | string | Single-line address, or `To be confirmed`. |

## 4. Out of scope / do not change

- The **guest pre-payment recovery email** (`order-confirmation-email.ts`) is a
  separate flow and remains inline HTML. It is not proof of payment.
- **Email verification** (`send-verification-email.ts`) and the **repair-request
  admin notification** remain inline HTML and are not templated here.
- No template may be used to bypass the paid-notification state machine: shop and
  mods confirmations still send only after a verified, committed, fully-settled
  payment, and still honour the duplicate-send protection and ambiguous-outcome
  handling in `send-paid-confirmation.ts`.

## 5. Testing without sending real email

`src/lib/email/email-templates.test.ts` covers variable construction, missing
configuration (inline fallback) and that a configured template is selected. It
never sends a real email. The outbound suppression policy
(`EMAIL_SEND_DISABLED` / `EMAIL_TEST_RECIPIENT`) applies identically on the
template path; see `docs/production/configuration-checklist.md`.
