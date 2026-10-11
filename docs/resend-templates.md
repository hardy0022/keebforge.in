# Resend-managed email templates

Every KeebForge transactional email is rendered by a template published in the
Resend dashboard rather than by inline HTML in this codebase:

| Email | Builder | Send path |
|-------|---------|-----------|
| Password reset | `passwordResetEmail` | `src/lib/auth/better-auth.ts` |
| Email verification | `verificationEmail` | `src/lib/auth/send-verification-email.ts` |
| Contact-inquiry admin notice | `contactInquiryEmail` | `src/app/actions/inquiry.ts` |
| Custom-work / repair-request admin notice | `repairRequestEmail` | `src/app/actions/repair-request.ts` |
| Shop paid-order confirmation | `buildShopPaidConfirmation` | `src/lib/notifications/send-paid-confirmation.ts` |
| Mods paid-order confirmation | `buildModsPaidConfirmation` | `src/lib/notifications/send-paid-confirmation.ts` |

The application remains the authority for data retrieval, validation, recipient
selection, authorisation, payment verification, idempotency, retry
classification, notification state transitions and HTML escaping. A template only
decides layout and copy; it receives already-decided values as variables.

> Status: the six templates above have been created and published in the Resend
> account. Their ids are **not** committed to the repository — set each one as an
> environment variable (section 1). Until an id is configured the corresponding
> path cannot render that email and reports a hard "not configured" failure. There
> is **no inline-HTML fallback**.

The old guest pre-payment "awaiting payment" email
(`src/lib/payments/order-confirmation-email.ts`) has been **removed**; the guest
recovery link is served from the order-success page, not email.

## 1. Templates and environment variables

Each template is enabled independently by setting the matching environment
variable to the id shown in the Resend dashboard (`templates` → your template →
the `id`).

| # | Email | Resend template (suggested name) | Environment variable |
|---|-------|----------------------------------|----------------------|
| 1 | Password reset | `keebforge-password-reset` | `RESEND_TEMPLATE_PASSWORD_RESET` |
| 2 | Email verification | `keebforge-email-verification` | `RESEND_TEMPLATE_EMAIL_VERIFICATION` |
| 3 | Contact inquiry (admin) | `keebforge-contact-inquiry` | `RESEND_TEMPLATE_CONTACT_INQUIRY` |
| 4 | Repair request (admin) | `keebforge-repair-request` | `RESEND_TEMPLATE_REPAIR_REQUEST` |
| 5 | Shop paid-order confirmation | `keebforge-shop-order-paid` | `RESEND_TEMPLATE_SHOP_ORDER_PAID` |
| 6 | Mods paid-order confirmation | `keebforge-mods-order-paid` | `RESEND_TEMPLATE_MODS_ORDER_PAID` |

Do **not** commit real template ids to the repository. Set them in the
deployment environment (Vercel) and, if needed locally, in `.env.local`.

Behaviour when a variable is unset, blank, or whitespace only: the path treats
that email as unconfigured and refuses — it does **not** fall back to inline
HTML. Specifically:

- password reset / email verification: logged and the send is skipped;
- contact inquiry / repair request: the action returns an error;
- paid confirmations: the sender records a definitive `template:not-configured`
  failure (retryable once the id is set).

## 2. Publishing or changing a template

Templates can be created either through the Resend dashboard or the API. The API
is preferred because `{{{KEY}}}` text pasted into the editor does **not**
auto-register variables, which otherwise requires many manual dialog entries.

1. Sign in at <https://resend.com> and open **Templates** (or use the API).
2. For each row above: create the template, name it as suggested, and build the
   body using the variables listed in section 3.
3. Confirm the sending domain `keebforge.in` is verified (it is used by the
   existing `EMAIL_FROM` / `no-reply@keebforge.in` senders).
4. **Publish** the template — draft templates cannot be sent.
5. Copy the published template `id` and set the matching environment variable in
   the deployment environment. Redeploy/refresh so the server picks it up.
6. Send a test from the dashboard to confirm the variables render. Do not send a
   test to a real customer address.

### API reference

Base `https://api.resend.com`, header `Authorization: Bearer $RESEND_API_KEY`.

```sh
# Create (then publish) a template
curl -X POST https://api.resend.com/templates \
  -H "Authorization: Bearer $RESEND_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"keebforge-password-reset","from":"KeebForge <no-reply@keebforge.in>","subject":"Reset your KeebForge password","html":"...","variables":[{"key":"resetUrl","type":"string","fallback_value":"#"}]}'

curl -X POST https://api.resend.com/templates/{id}/publish \
  -H "Authorization: Bearer $RESEND_API_KEY"
```

`{{{KEY}}}` inserts a value **without** escaping; `{{KEY}}` escapes. The
`*Html` variables below are pre-escaped in the application and must be inserted
with `{{{KEY}}}`.

## 3. Template variables

Resend's send API accepts only flat `string | number` variables. List-shaped
content is pre-rendered in the application into an **already HTML-escaped** HTML
fragment and passed as a single `*Html` variable. Those `*Html` variables must be
inserted **without** further escaping (`{{{KEY}}}`). All other variables are
plain text.

`EMAIL`, `FIRST_NAME`, `LAST_NAME`, `UNSUBSCRIBE_URL`, `contact` and `this` are
reserved by Resend; no key below collides with them (the inquiry/repair sender's
address is `customerEmail`, not `email`).

### 3.1 Password reset (`RESEND_TEMPLATE_PASSWORD_RESET`)

| Variable | Type | Notes |
|----------|------|-------|
| `name` | string | Account holder's name (plain text). |
| `resetUrl` | string | **Trusted**, Better Auth generated reset URL. Use in an `href`. Never generate or edit this in the template. |
| `expiresIn` | string | Human-readable expiry, currently `1 hour`. |

The link must point at the URL supplied in `resetUrl` unchanged. The reset token
is generated and validated by Better Auth only; the template must never create a
token or reassemble the URL.

### 3.2 Email verification (`RESEND_TEMPLATE_EMAIL_VERIFICATION`)

| Variable | Type | Notes |
|----------|------|-------|
| `name` | string | Account holder's name (plain text). |
| `verifyUrl` | string | **Trusted**, Better Auth generated verification URL. Use in an `href`. Never generate or edit this. |
| `expiresIn` | string | Human-readable expiry, currently `1 hour`. |

### 3.3 Contact inquiry (`RESEND_TEMPLATE_CONTACT_INQUIRY`)

| Variable | Type | Notes |
|----------|------|-------|
| `name` | string | Sender's name. |
| `phone` | string | Sender's phone. |
| `customerEmail` | string | Sender's email (not the recipient). |
| `deviceModel` | string | May be empty. |
| `issue` | string | Free-text description. |
| `photosCount` | number | Number of attached photos (0 when none). |
| `photosHtml` | HTML | Pre-escaped heading + linked photo URLs, or `""`. Insert unescaped. |

The recipient (the shared admin contact inbox) and reply-to behaviour are set by
the application and must not be changed by the template.

### 3.4 Repair request (`RESEND_TEMPLATE_REPAIR_REQUEST`)

| Variable | Type | Notes |
|----------|------|-------|
| `reference` | string | e.g. `KF-2026-000789`. Also appears in the subject. |
| `serviceType` | string | e.g. `Repair`. |
| `deviceType` | string | e.g. `Keyboard`. |
| `brand` | string | Device brand. |
| `model` | string | Device model. |
| `workTypes` | string | Comma-joined request categories. |
| `condition` | string | Declared condition. |
| `budget` | string | Declared budget. |
| `description` | string | Free-text description. |
| `name` | string | Requester's name. |
| `phone` | string | Requester's phone. |
| `customerEmail` | string | Requester's email (not the recipient). |
| `contactNotes` | string | May be empty. |
| `shipping` | string | Declared shipping preference. |
| `photosCount` | number | Number of attached photos (0 when none). |
| `photosHtml` | HTML | Pre-escaped heading + linked photo URLs, or `""`. Insert unescaped. |

The recipient (the shared admin contact inbox) is set by the application.

### 3.5 Shop paid-order confirmation (`RESEND_TEMPLATE_SHOP_ORDER_PAID`)

| Variable | Type | Notes |
|----------|------|-------|
| `orderNumber` | string | e.g. `KF-2026-000123`. |
| `customerName` | string | May be empty. |
| `itemsHtml` | HTML | Pre-escaped order-item rows, each with a product image when the order stored a valid Cloudinary URL. Insert unescaped. |
| `totalsHtml` | HTML | Pre-escaped totals table (subtotal, shipping, discount, total paid). Insert unescaped. |
| `shippingName` | string | Recipient name, or `Customer`. |
| `shippingAddress` | string | Single-line address, or `To be confirmed`. |
| `orderUrl` | string | Absolute tracking URL (`/track-order?order=…`). Use in an `href`. |

The reproducible source of this template lives in the repository at
[`scripts/email/resend-shop-order-paid.ts`](../scripts/email/resend-shop-order-paid.ts).
It performs **no** network calls — run `npx tsx scripts/email/resend-shop-order-paid.ts`
to print the exact publishable payload (or `--html` for the HTML only), then
create/publish it through the dashboard or API as in section 2. Its output is
guarded by `npm run check:resend-template`.

Layout and metadata of the approved design:

- The KeebForge.in wordmark (the brand logo) sits at the left of the header bar,
  next to `ORDER #{{{orderNumber}}}` on the right.
- `Thank you for your order!` and the green `✓ PAYMENT CONFIRMED` badge share a
  single table row (side-by-side on desktop, naturally wrapping on narrow
  screens).
- There is **no banner image**.
- Sender `KeebForge.in <orders@keebforge.in>`, reply-to `contact@keebforge.in`,
  subject `Order {{orderNumber}} — Payment Confirmed | KeebForge.in`.
  The reply-to has effect because the application does not override it. The
  send path still supplies `from`/`subject` at send time (which take precedence
  over the template defaults — see the send-email reference), with `from` taken
  from `EMAIL_FROM`; set the display name there if the runtime sender must read
  `KeebForge.in`.

### 3.6 Mods paid-order confirmation (`RESEND_TEMPLATE_MODS_ORDER_PAID`)

| Variable | Type | Notes |
|----------|------|-------|
| `orderNumber` | string | e.g. `KF-2026-000456`. |
| `customerName` | string | May be empty. |
| `amountPaid` | string | Formatted amount from verified payment rows, e.g. `₹245`. |
| `configHtml` | HTML | Pre-escaped configuration table (or a safe fallback row). Insert unescaped. |
| `servicesHtml` | HTML | Pre-escaped services table (or a safe fallback row). Insert unescaped. |
| `shippingMethod` | string | e.g. `You ship your device to KeebForge (Express)`. |
| `shippingAddress` | string | Single-line address, or `To be confirmed`. |
| `orderUrl` | string | Absolute tracking URL (`/track-order?order=…`). Use in an `href`. |

Item thumbnails in `itemsHtml` use the Cloudinary delivery URL stored with the
order, transformed in-memory (`f_auto,q_auto,c_limit,w_120`); a missing or
non-HTTPS URL is simply omitted, so a bad image can never break a send. The CTA
always points at the public tracking page (`NEXT_PUBLIC_APP_URL`) — never a
secret or authenticated link.

## 4. Invariants the templates must not break

- No template may bypass the paid-notification state machine: shop and mods
  confirmations still send only after a verified, committed, fully-settled
  payment, and still honour duplicate-send protection and ambiguous-outcome
  handling in `send-paid-confirmation.ts`.
- Recipient selection stays in the application (and in the outbound-recipient
  policy in `@/lib/email/outbound`); templates must not hard-code a recipient.
- Password-reset and verification links must use the `resetUrl` / `verifyUrl`
  values unchanged; the template must never mint a token or reassemble a URL.
- `customerEmail` (inquiry / repair) is the sender's address, never a recipient.

## 5. Testing without sending real email

- `src/lib/email/email-templates.test.ts` covers variable construction (including
  escaping of `*Html` fragments), the "configured or not" rule, and that a
  configured template is selected. It never sends a real email.
- `src/lib/email/outbound-paths.test.ts` drives the inquiry/repair/paid send paths
  with stub template ids and asserts the outbound-recipient policy still redirects
  and suppresses.
- `src/lib/notifications/paid-confirmation.test.ts` covers the paid builders and
  the notification state machine.

The outbound suppression policy (`EMAIL_SEND_DISABLED` / `EMAIL_TEST_RECIPIENT`)
applies identically on the template path; see
`docs/production/configuration-checklist.md`.
