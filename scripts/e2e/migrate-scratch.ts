#!/usr/bin/env node
/**
 * Scratch migration wrapper.
 *
 *   npm run db:scratch:deploy -- deploy --database keebforge_e2e
 *
 * Reads `.env.e2e.local` through the shared `local-env` guard — the same file and
 * the same validation the seed, the server launcher and the order-success-page
 * runner use — so every local E2E database operation now has exactly one source
 * of connection settings. The password is taken from the validated DATABASE_URL in
 * that file rather than from a separate `SCRATCH_DB_PASSWORD` export, so the
 * credentials cannot disagree with the target they belong to.
 *
 * Why a wrapper rather than an alias: `prisma migrate deploy` follows
 * `DIRECT_URL` out of `.env`, which is the production Supabase direct endpoint.
 * Overriding only `DATABASE_URL` is not enough, and a pre-flight check that
 * inspects `DATABASE_URL` alone will happily confirm the scratch database while
 * the command itself runs against production. That is precisely how two
 * migrations reached production on 2026-10-02.
 *
 * So this wrapper never reads `.env` for either connection variable. It builds
 * both `DATABASE_URL` and `DIRECT_URL` from the same explicit arguments, proves
 * they describe the approved disposable database, and only then spawns the CLI.
 * Anything it cannot establish is a refusal.
 *
 * All logic lives in migrate-scratch-plan.ts, which is unit tested in
 * scratch-guard.test.ts. This file is the executor and holds no logic of its own.
 */
import { spawn } from "node:child_process";
import { planMigrationRun, preflightSubcommand } from "./migrate-scratch-plan";
import { ScratchTargetError, assertScratchPair } from "./scratch-guard";
import { LocalEnvError, resolveLocalEnv } from "./local-env";

function refuse(code: string, message: string): never {
  console.error(`REFUSED [${code}] ${message}`);
  console.error("No database command was run.");
  process.exit(1);
}

// Subcommand first. Whether `reset` is acceptable is a property of the request,
// not of this machine's configuration, so it must be decided before any
// configuration file is read. Otherwise a missing `.env.e2e.local` would mask
// `UNSAFE_SUBCOMMAND` behind `MISSING_LOCAL_ENV_FILE`.
const sub = preflightSubcommand(process.argv.slice(2));
if (!sub.ok) refuse(sub.code, sub.message);

// The single local source of truth. Missing file, missing variable, remote host
// or mismatched pair all refuse here, before any URL is built.
let localTarget: ReturnType<typeof resolveLocalEnv>["target"];
let localPassword: string;
try {
  const local = resolveLocalEnv();
  localTarget = local.target;
  localPassword = decodeURIComponent(new URL(local.databaseUrl).password);
  if (localPassword === "") {
    refuse(
      "MISSING_PASSWORD",
      "DATABASE_URL in .env.e2e.local carries no password. Add one so the disposable " +
        "container can authenticate.",
    );
  }
} catch (e) {
  if (e instanceof LocalEnvError) refuse(e.code, e.message);
  throw e;
}

const plan = planMigrationRun(process.argv.slice(2), {
  ...process.env,
  SCRATCH_DB_PASSWORD: localPassword,
});

if (!plan.ok) refuse(plan.code, plan.message);

// The explicit `--database` flag must agree with the validated file. A flag that
// contradicts the configuration is an ambiguity, and ambiguity is a refusal.
if (plan.target.database !== localTarget.database) {
  refuse(
    "DATABASE_FLAG_MISMATCH",
    `--database ${plan.target.database} contradicts ${localTarget.database}, which is the ` +
      `database validated in .env.e2e.local. Refusing rather than choosing between them.`,
  );
}

// Second gate, immediately before the child process can exist. The planner
// already ran this check; running it again here means the guard and the exec
// are adjacent in the source, with no room for the environment to drift between
// them.
try {
  assertScratchPair({
    databaseUrl: plan.childEnv.DATABASE_URL,
    directUrl: plan.childEnv.DIRECT_URL,
  });
} catch (e) {
  if (e instanceof ScratchTargetError) refuse(e.code, e.message);
  throw e;
}

// Only the sanitized target is printed. Never the URL, the user or the password.
console.log("TARGET VERIFIED (loopback scratch database)");
console.log(`  host     ${plan.target.host}`);
console.log(`  port     ${plan.target.port}`);
console.log(`  database ${plan.target.database}`);
console.log(`  command  npx ${plan.args.join(" ")}`);
console.log("  both DATABASE_URL and DIRECT_URL are pinned to this verified target");
console.log("");

const child = spawn(plan.command, plan.args, {
  stdio: "inherit",
  // The parent environment is inherited, then both connection variables are
  // overwritten with the verified values. A DIRECT_URL sourced from `.env` is
  // replaced here, never consulted.
  env: { ...process.env, ...plan.childEnv },
});

child.on("error", (e) => {
  console.error(`Failed to start ${plan.command}: ${e.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});