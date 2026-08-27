import { createAuthClient } from "better-auth/react";
import { sentinelClient } from "@better-auth/infra/client";

/**
 * Shared Better Auth browser client. sentinelClient() adds visitor
 * fingerprinting (X-Visitor-Id) and automatic Proof-of-Worwork challenge solving
 * for the Sentinel security plugin on the server.
 */
export const authClient = createAuthClient({
  plugins: [
    // Public ingestion URL (not a secret) — inlined at build time; without it
    // Sentinel falls back to global identify ingestion with a console warning.
    sentinelClient({ identifyUrl: process.env.NEXT_PUBLIC_BETTER_AUTH_IDENTIFY_URL }),
  ],
});
