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
 *       SCRATCH_DB_PASSWORD=... npm run db:scratch:deploy -- deploy --database <approved-name>
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