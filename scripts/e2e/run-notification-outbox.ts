/**
 * Guarded entrypoint for `src/lib/notifications/notification-outbox.integration.test.ts`.
 *
 * The test imports `PrismaClient` statically, and that import loads `.env` into
 * `process.env` (whose `DIRECT_URL` points at production). `applyLocalEnv` runs
 * here first, before the test module — and therefore before Prisma — is loaded,
 * so the validated loopback values are already set and dotenv never overwrites
 * them. The test re-verifies the live environment with `assertLocalEnvApplied`
 * before it constructs a client, so a production URL is refused before any query.
 *
 * USAGE
 *
 *   npm run e2e:notification-outbox
 *
 * Requires `.env.e2e.local` and a disposable PostgreSQL reachable at the
 * loopback scratch database it names. The test wraps the migration and every
 * write in a transaction that it always rolls back, so no persistent state is
 * modified and no server process is needed.
 */
import { describeTarget } from "./scratch-guard";
import { applyLocalEnv } from "./local-env";

const TEST_MODULE = "../../src/lib/notifications/notification-outbox.integration.test";

async function main(): Promise<void> {
  const target = applyLocalEnv();
  const described = describeTarget(target);
  console.log(
    `Local environment pinned to ${described.database} on ${described.host}:${described.port}`,
  );

  await import(TEST_MODULE);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
