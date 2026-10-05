/**
 * Guarded entrypoint for `src/lib/security/order-success-page.test.ts`.
 *
 * WHY A RUNNER IS NEEDED
 *
 * That test performs dozens of `deleteMany` and `create` calls through
 * `PrismaClient`, and it imports Prisma statically:
 *
 *   import { PrismaClient } from "@prisma/client";
 *
 * ES module imports are hoisted and evaluated before any statement in the module
 * body. That import loads `.env` into `process.env`, and `.env`'s `DIRECT_URL`
 * points at production. So the file could never pin a local environment from its
 * own body before Prisma was loaded — the old workaround turned on shell
 * export-all mode and dot-sourced the whole of `.env.e2e`, which put an
 * unvalidated env file into the shell, including the production-facing
 * `DIRECT_URL`, and relied on the operator having sourced it correctly. Neither
 * the mode flag nor the dot-source line is reproduced literally here, so neither
 * can be copied out of this comment and run.
 *
 * `applyLocalEnv` runs here instead, before the test module is imported at all.
 * Because dotenv never overwrites an already-set key, the validated loopback
 * values are still in place when the test module's own Prisma import loads
 * `.env`. The test additionally re-verifies the live environment with
 * `assertLocalEnvApplied` before constructing its client, so running it directly
 * by path refuses rather than connecting.
 *
 * USAGE
 *
 *   npm run e2e:order-success-page
 *
 * Requires `.env.e2e.local`, and a `next start` server already listening on
 * `SUCCESS_E2E_URL` (default http://127.0.0.1:3111). Start it with
 * `npm run e2e:server`, which applies the same guard.
 */
import { describeTarget } from "./scratch-guard";
import { applyLocalEnv } from "./local-env";

const TEST_MODULE = "../../src/lib/security/order-success-page.test";

async function main(): Promise<void> {
  // Validated before the test module — and therefore before any Prisma import —
  // exists in this process.
  const target = applyLocalEnv();
  console.log(
    `Local environment pinned to ${describeTarget(target).database} on ` +
      `${describeTarget(target).host}:${describeTarget(target).port}`,
  );

  const base = process.env.SUCCESS_E2E_URL ?? "http://127.0.0.1:3111";
  console.log(`Expecting a server at ${base}. It must already be running.`);

  await import(TEST_MODULE);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});