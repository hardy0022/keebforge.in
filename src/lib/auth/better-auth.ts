import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { dash, sentinel } from "@better-auth/infra";
import { Resend } from "resend";
import { prisma } from "@/lib/db/prisma";
import { isStrongPassword } from "@/lib/utils/password";
import { getOrCreateProfileFromUser } from "@/lib/auth/profile";
import { claimGuestOrdersForVerifiedProfile } from "@/lib/orders/claim-guest-orders";

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
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data, error } = await resend.emails.send({
          from: "KeebForge <no-reply@keebforge.in>",
          to: user.email,
          subject: "Reset your KeebForge password",
          html:
            `<h2>Reset your password — KeebForge.in</h2>` +
            `<p>Hi ${user.name.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)},</p>` +
            `<p>We received a request to reset your password. Tap the button below to choose a new one. This link expires in 1 hour.</p>` +
            `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 20px;background:#a3e635;color:#0a0a0a;border-radius:10px;text-decoration:none;font-weight:600">Reset password</a></p>` +
            `<p>If you didn't request this, you can safely ignore this email — your password won't change.</p>`,
        });
        if (error) {
          // API-level rejection (rate limit, sender policy, invalid recipient)
          // — does NOT throw, so log it or it stays invisible.
          console.error("Resend error (password reset):", error);
          return;
        }
        console.log(`[auth] reset email sent to ${user.email} (id=${data?.id})`);
      } catch (e) {
        // Must never fail the request (and leak that the email didn't send).
        console.error("Resend error (password reset):", e);
      }
    },
  },
  // Email ownership proof. `sendOnSignUp` mails a verification link on account
  // creation; clicking it flips emailVerified and fires the claim hook below.
  // Deliberately NOT `requireEmailVerification` — existing unverified accounts
  // must keep signing in.
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { data, error } = await resend.emails.send({
          from: "KeebForge <no-reply@keebforge.in>",
          to: user.email,
          subject: "Verify your KeebForge email",
          html:
            `<h2>Verify your email — KeebForge.in</h2>` +
            `<p>Hi ${user.name.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)},</p>` +
            `<p>Confirm your email to secure your account and link any past guest orders to it.</p>` +
            `<p style="margin:24px 0"><a href="${url}" style="display:inline-block;padding:12px 20px;background:#a3e635;color:#0a0a0a;border-radius:10px;text-decoration:none;font-weight:600">Verify email</a></p>` +
            `<p>This link expires in 1 hour. If you didn't create an account, you can ignore this email.</p>`,
        });
        if (error) {
          console.error("Resend error (email verification):", error);
          return;
        }
        console.log(`[auth] verification email sent to ${user.email} (id=${data?.id})`);
      } catch (e) {
        // Must never fail sign-up (and leak that the email didn't send).
        console.error("Resend error (email verification):", e);
      }
    },
    // Runs after `emailVerified: true` is persisted, before auto-sign-in. It is
    // awaited by the endpoint, so a failure here is caught and logged rather
    // than aborting an already-successful verification.
    afterEmailVerification: async (user) => {
      try {
        const profile = await getOrCreateProfileFromUser(user);
        const claimed = await claimGuestOrdersForVerifiedProfile(
          profile.id,
          user.email,
        );
        if (claimed > 0) {
          console.log(`[auth] linked ${claimed} guest order(s) to ${user.email}`);
        }
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
