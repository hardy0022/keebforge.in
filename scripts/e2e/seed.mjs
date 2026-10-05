/**
 * REFUSAL SHIM — this script no longer seeds anything.
 *
 * The original version of this file was an unguarded E2E seed. It declared a
 * top-level `import { PrismaClient } from "@prisma/client"`, which loads `.env`
 * into the environment before any check runs. `.env` holds production
 * credentials, so `node scripts/e2e/seed.mjs` could write `E2E_`-tagged rows
 * into the production database.
 *
 * The guarded seed lives in `seed.ts` and runs via `npm run e2e:seed`. It
 * validates both connection variables against the approved loopback scratch
 * allowlist before importing Prisma.
 *
 * This file is kept so that anyone still invoking the old path gets an
 * explanation instead of a silent production write. It must never grow seeding
 * logic again.
 */

console.error(
  [
    "REFUSED [UNGUARDED_SEED]",
    "scripts/e2e/seed.mjs is disabled because it could import @prisma/client with",
    "production credentials from .env. No rows were written and no database was contacted.",
    "",
    "Run the guarded seed instead:",
    "  npm run e2e:seed",
    "",
    "It requires .env.e2e.local (copy from .env.e2e.local.example) with both",
    "DATABASE_URL and DIRECT_URL pointing at the approved loopback scratch database.",
  ].join("\n"),
);

process.exit(1);