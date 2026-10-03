/**
 * Start a Next.js server against the approved local E2E database.
 *
 * WHY THIS EXISTS
 *
 * `order-success-page.test.ts` fetches real HTML from a running server, because
 * the defect it guards (PII in the rendered page) can only be proven against the
 * actual document. Getting that server pointed at the disposable database used to
 * mean exporting connection variables in the shell by hand.
 *
 * This is the explicit replacement. It reads `.env.e2e.local` through the same
 * `local-env` guard the seed and the migration wrapper use, validates both
 * connection variables against the loopback allowlist, and only then spawns
 * `next start`.
 *
 * WHY THE PRODUCTION BUILD ENVIRONMENT IS NOT TOUCHED
 *
 * `next start` serves whatever `.next` was last built. Building is a separate
 * step and is not performed here. This process changes nothing outside its own
 * environment: no env file is written, and the child inherits only the already
 * pinned, already validated loopback values. A production deployment path is
 * unaffected.
 *
 * USAGE
 *
 *   npm run e2e:server            # default port 3111
 *   PORT=3112 npm run e2e:server
 *
 * For the Razorpay webhook capture used by the security suite:
 *
 *   E2E_CALL_LOG=/tmp/opencode/os-page-calls.log npm run e2e:server
 */
import { spawn } from "node:child_process";
import { describeTarget } from "./scratch-guard";
import { applyLocalEnv } from "./local-env";

function main(): void {
  const target = applyLocalEnv();
  const port = process.env.PORT ?? "3111";

  console.log(
    `Starting next start against ${describeTarget(target).database} on ` +
      `${describeTarget(target).host}:${describeTarget(target).port} (server port ${port})`,
  );

  // `process.env` already holds the validated pair; the child inherits it and
  // cannot fall back to `.env` for these two keys because they are set.
  const child = spawn("npx", ["next", "start", "-p", port], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("error", (e) => {
    console.error(`Could not start the local server: ${e.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 0));
  });
}

try {
  main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}