import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { dash } from "@better-auth/infra";
import { prisma } from "../../lib/prisma";

/**
 * KeebForge authentication — Better Auth (sole auth authority).
 * Database: Prisma → Supabase PostgreSQL. Media: Cloudinary. Email: Resend.
 *
 * Social providers (Google/Discord) only activate when their client ID/secret
 * are set in .env — blank values are omitted so dev still boots.
 */
export const auth = betterAuth({
  baseURL: process.env.NODE_ENV === "production" ? process.env.BETTER_AUTH_URL ?? "https://keebforge.in" : "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true },
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
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000", process.env.BETTER_AUTH_URL ?? "https://keebforge.in"],
  plugins: [dash({ apiKey: process.env.BETTER_AUTH_API_KEY })],
});
