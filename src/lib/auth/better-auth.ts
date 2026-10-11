import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { dash, sentinel } from "@better-auth/infra";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import { isStrongPassword } from "@/lib/utils/password";
import { getOrCreateProfileFromUser } from "@/lib/auth/profile";
import { sendVerificationEmailMessage } from "@/lib/auth/send-verification-email";
import {
  logSuppressedDelivery,
  resolveOutboundRecipient,
} from "@/lib/email/outbound";
import { passwordResetEmail, readTemplateIds } from "@/lib/email/templates";
import { resendErrorDiagnostic } from "@/lib/notifications/resend-diagnostics";

/**
 * KeebForge authentication — Better Auth (sole auth authority).
 * Database: Prisma → Supabase PostgreSQL. Media: Cloudinary. Email: Resend.
 *
 * Social providers (Google/Discord) only activate when their client ID/secret
 * are set in .env — blank values are omitted so dev still boots.
 */
export const auth = betterAuth({
  appName: "KeebForge",
  baseURL:
    process.env.NODE_ENV === "production"
      ? (process.env.BETTER_AUTH_URL ?? "https://keebforge.in")
      : "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        // Test/suppression policy. Suppressed: nothing is sent and the request
        // still succeeds (Better Auth must not leak that mail was withheld).
        const plan = resolveOutboundRecipient(user.email);
        if (plan.action === "skip") {
          logSuppressedDelivery(plan.reason);
          return;
        }
        const resend = new Resend(process.env.RESEND_API_KEY);
        // Better Auth generated the token and `url` (from this app's baseURL —
        // https://keebforge.in in production). A configured Resend template
        // renders the message; otherwise the inline HTML fallback is sent. The
        // application never generates the token, and the URL is delivered only.
        const mail = passwordResetEmail(
          { name: user.name, resetUrl: url },
          readTemplateIds().passwordReset,
        );
        const from = "KeebForge <no-reply@keebforge.in>";
        const { data, error } = mail.template
          ? await resend.emails.send({
              from,
              to: plan.to,
              subject: mail.subject,
              template: mail.template,
            })
          : await resend.emails.send({
              from,
              to: plan.to,
              subject: mail.subject,
              html: mail.html,
            });
        if (error) {
          // API-level rejection (rate limit, sender policy, invalid recipient)
          // — does NOT throw, so log it or it stays invisible. Only the
          // sanitized diagnostic is logged; the provider message can echo the
          // recipient address.
          console.error(
            "Resend error (password reset):",
            resendErrorDiagnostic(error),
          );
          return;
        }
        // No recipient address is logged — success is recorded by id only.
        console.log(
          `[auth] reset email sent${
            plan.redirected ? " (redirected to test recipient)" : ""
          } (id=${data?.id})`,
        );
      } catch (e) {
        // Must never fail the request (and leak that the email didn't send).
        console.error(
          "Resend error (password reset):",
          resendErrorDiagnostic(e),
        );
      }
    },
  },
  // Email ownership proof. `sendOnSignUp` mails a verification link on account
  // creation; clicking it flips emailVerified and fires the claim hook below.
  // Deliberately NOT `requireEmailVerification` — existing unverified accounts
  // must keep signing in.
  //
  // Unlike `sendResetPassword` below, this one REJECTS when Resend fails.
  // Sign-up/sign-in are unaffected (Better Auth wraps those calls in
  // runInBackgroundOrAwait, which logs and carries on), but /send-verification
  // -email awaits it directly — so the resend action on /auth/error only
  // reports success when the provider actually accepted the message. See
  // src/lib/auth/send-verification-email.ts for the full reasoning.
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmailMessage({ user, url });
    },
    // Runs after `emailVerified: true` is persisted, before auto-sign-in. It is
    // awaited by the endpoint, so a failure here is caught and logged rather
    // than aborting an already-successful verification.
    afterEmailVerification: async (user) => {
      try {
        // getOrCreateProfileFromUser provisions the profile AND claims this
        // account's unowned guest orders, so the order attach happens on the
        // very first authenticated request too, not only on this click.
        await getOrCreateProfileFromUser(user);
      } catch (e) {
        console.error("Failed to link guest orders after verification:", e);
      }
    },
  },
  // Lets users delete their own account from /account/settings. The delete-user
  // route is disabled by default; enabling it is the only change needed — no
  // schema or deletion logic of our own.
  user: {
    deleteUser: {
      enabled: true,
    },
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    },
    discord: {
      clientId: process.env.DISCORD_CLIENT_ID ?? "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET ?? "",
    },
  },
  trustedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    process.env.BETTER_AUTH_URL ?? "https://keebforge.in",
    "https://dash.better-auth.com",
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Enforce the register-page password policy server-side (sign-up and
      // password change only — sign-in is never gated on strength).
      if (
        ctx.path === "/sign-up/email" ||
        ctx.path === "/change-password" ||
        ctx.path === "/reset-password"
      ) {
        const password = (ctx.body as { password?: unknown } | undefined)
          ?.password;
        if (typeof password === "string" && !isStrongPassword(password)) {
          throw new APIError("BAD_REQUEST", {
            message: "Password does not meet the requirements.",
          });
        }
      }
    }),
  },
  // OAuth/callback failures must land on our branded page, never the dev-only
  // /api/auth/error default.
  onAPIError: {
    errorURL: "/auth/error",
  },
  advanced: {
    // Deployed behind Vercel/proxy: without these, every request shares the
    // proxy's IP and IP-based rate limiting would throttle everyone together.
    ipAddress: {
      ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],
    },
    database: {
      joins: true,
    },
  },
  plugins: [
    dash({ apiKey: process.env.BETTER_AUTH_API_KEY }),
    sentinel({
      apiKey: process.env.BETTER_AUTH_API_KEY,
      kvUrl: process.env.BETTER_AUTH_IDENTIFY_URL,
    }),
    organization(),
  ],
});
