#!/usr/bin/env node
/**
 * `db:deploy` — REFUSES TO RUN.
 *
 * This used to be `prisma migrate deploy`. That command reads `DIRECT_URL` from
 * `.env`, where it points at the production Supabase direct endpoint, so a
 * command that looked like a deployment tool was equally a way to write to
 * production by accident. On 2026-10-02 that is exactly what happened: a deploy
 * aimed at a disposable container applied two migrations to production because
 * only `DATABASE_URL` had been overridden.
 *
 * It is replaced rather than deleted so the intent stays discoverable. If you
 * reached for this expecting to deploy:
 *
 *   - To validate migrations against a disposable database (safe, guarded, both
 *     DATABASE_URL and DIRECT_URL pinned to a loopback target):
 *       npm run db:scratch:deploy -- --database keebforge_e2e_fresh
 *     There is no environment-variable prefix to supply. The target and the
 *     password both come from `.env.e2e.local`, read through the shared
 *     `local-env` guard, which refuses a missing file, a remote host, an
 *     unapproved database name, or a DATABASE_URL that disagrees with
 *     DIRECT_URL. Credentials are never read from `.env`, which is the
 *     production file and the root of the incident above.
 *
 *     Related read-only commands: `npm run db:scratch:status -- --database
 *     keebforge_e2e_fresh` for what is pending, and `npm run db:scratch:check`
 *     for the connection identity gate.
 *
 *   - To apply migrations to production: there is currently no command for this.
 *     See scripts/db/production-migration-path.ts for what is missing and why
 *     nothing was written to fill the gap.
 */
import { planProductionDeploy } from "./production-migration-path";

const plan = planProductionDeploy();

if (!plan.ok) {
  console.error(`REFUSED [${plan.code}] ${plan.message}`);
  console.error("No database command was run.");
  process.exit(1);
}

// Unreachable while planProductionDeploy always refuses. Present so that this
// file cannot start running Prisma if that function is ever changed without a
// deliberate review of this entrypoint.
console.error("REFUSED [PRODUCTION_PATH_NOT_ENABLED] This branch is unreachable.");
process.exit(1);