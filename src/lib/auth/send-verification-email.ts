import { APIError } from "better-auth";
import { Resend } from "resend";
import {
  logSuppressedDelivery,
  resolveOutboundRecipient,
} from "@/lib/email/outbound";
import { readTemplateIds, verificationEmail } from "@/lib/email/templates";
import { resendErrorDiagnostic } from "@/lib/notifications/resend-diagnostics";

/**
 * Verification-email delivery for Better Auth's `emailVerification.
 * sendVerificationEmail`.
 *
 * WHY THIS THROWS
 * ───────────────
 * The previous implementation swallowed every failure (`if (error) … return;`
 * plus an all-catching `try/catch`), so Better Auth's `/send-verification-email`
 * endpoint reported `{ status: true }` even when Resend had rejected the
 * message. That is harmless during sign-up — where Better Auth already wraps
 * the callback in `runInBackgroundOrAwait`, which logs and continues — but it
 * makes any *resend* UI lie: the user would be told "sent" for an email that
 * never left the building.
 *
 * Throwing is safe at every other call site because they all guard it:
 *   - sign-up / sign-in  → `runInBackgroundOrAwait` (catches and logs)
 *   - OAuth dispatch     → local `try/catch` in `dispatchVerificationEmail`
 *   - resend endpoint    → `try { … } catch { error = e }` → rethrown as the
 *     HTTP error, which is exactly the truthfulness we want.
 *
 * The thrown message is a fixed string. Resend's own error text never reaches
 * the caller, so no provider detail can surface in a response body.
 *
 * The message body lives in a published Resend template; only the variables are
 * built here. The template id is resolved inside the default transport, so a
 * test that injects `deliver` never needs it.
 */

export const VERIFICATION_EMAIL_SUBJECT = "Verify your KeebForge email";
export const VERIFICATION_EMAIL_FROM = "KeebForge <no-reply@keebforge.in>";

type Mail = {
  to: string;
  subject: string;
  variables: Record<string, string | number>;
};

type SendResult = {
  data?: { id?: string } | null;
  error?: { message?: string } | null;
};

type Deliver = (mail: Mail) => SendResult | Promise<SendResult>;

/** Default transport. Resend returns (not throws) on API-level rejection. */
function deliverViaResend(mail: Mail): Promise<SendResult> {
  const templateId = readTemplateIds().emailVerification;
  if (!templateId) {
    return Promise.reject(new Error("verification template not configured"));
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  return resend.emails.send({
    from: VERIFICATION_EMAIL_FROM,
    to: mail.to,
    subject: mail.subject,
    template: { id: templateId, variables: mail.variables },
  });
}

/**
 * Sends one verification email. Resolves only when the provider accepted the
 * message; rejects with a fixed, provider-free message otherwise.
 *
 * `deliver` is injectable so the failure contract can be tested without a
 * network call.
 */
export async function sendVerificationEmailMessage(
  args: { user: { name: string; email: string }; url: string },
  deliver: Deliver = deliverViaResend,
): Promise<void> {
  const rejected = (): never => {
    throw new APIError("SERVICE_UNAVAILABLE", {
      code: "VERIFICATION_SEND_FAILED",
      message: "Verification email could not be sent.",
    });
  };

  // Test/suppression policy: an env override redirects this to a single test
  // address and EMAIL_SEND_DISABLED suppresses it entirely. Neither is a
  // delivery failure, so a suppressed send resolves quietly — the caller is
  // not told anything different, and no real recipient is ever contacted.
  const plan = resolveOutboundRecipient(args.user.email);
  if (plan.action === "skip") {
    logSuppressedDelivery(plan.reason);
    return;
  }

  const payload = verificationEmail({
    name: args.user.name,
    verifyUrl: args.url,
  });

  let result: SendResult;
  try {
    result = await deliver({
      to: plan.to,
      subject: payload.subject,
      variables: payload.variables,
    });
  } catch (e) {
    // Transport/SDK failure (or an unconfigured template). Log server-side only
    // — the caller gets `rejected`. Only the sanitized diagnostic is logged; a
    // provider message can echo the recipient address.
    console.error(
      "Resend error (email verification):",
      resendErrorDiagnostic(e),
    );
    throw rejected();
  }

  if (result.error) {
    // API-level rejection (rate limit, sender policy, invalid recipient).
    // Resend does NOT throw for these, so this is the common failure path.
    console.error(
      "Resend error (email verification):",
      resendErrorDiagnostic(result.error),
    );
    throw rejected();
  }

  // No recipient address is logged — success is recorded by id only.
  console.log(
    `[auth] verification email sent${
      plan.redirected ? " (redirected to test recipient)" : ""
    } (id=${result.data?.id})`,
  );
}
