import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { organization } from "better-auth/plugins";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { dash, sentinel } from "@better-auth/infra";
import { prisma } from "../../lib/prisma";
import { isStrongPassword } from "../password";

/**
 * KeebForge authentication — Better Auth (sole auth authority).
 * Database: Prisma → Supabase PostgreSQL. Media: Cloudinary. Email: Resend.
 *
 * Social providers (Google/Discord) only activate when their client ID/secret
 * are set in .env — blank values are omitted so dev still boots.
 */
export const auth = betterAuth({
  appName: "KeebForge",
  baseURL: process.env.NODE_ENV === "production" ? process.env.BETTER_AUTH_URL ?? "https://keebforge.in" : "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
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
      if (ctx.path === "/sign-up/email" || ctx.path === "/change-password") {
        const password = (ctx.body as { password?: unknown } | undefined)?.password;
        if (typeof password === "string" && !isStrongPassword(password)) {
          throw new APIError("BAD_REQUEST", { message: "Password does not meet the requirements." });
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
