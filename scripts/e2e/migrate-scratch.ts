#!/usr/bin/env node
/**
 * Scratch migration wrapper.
 *
 *   npm run db:scratch:check                                     # identity gate
 *   npm run db:scratch:auth-preflight                            # Supabase auth shim
 *   npm run db:scratch:status -- --database keebforge_e2e_fresh  # what is pending
 *   npm run db:scratch:deploy -- --database keebforge_e2e_fresh  # apply it
 *   npm run db:scratch:diff   -- --database keebforge_e2e_fresh  # drift
 *
 * The subcommand is the tail of the npm script name, not an argument to it.
 * `db:scratch:status` already ends in `status`, so appending `status` again —
 * `npm run db:scratch:status -- status` — emits `prisma migrate status status`
 * and Prisma rejects it. Only flags after `--` belong on the command line.
 *
 * Before `deploy` only, this wrapper runs a read-only check that `auth.uid()`
 * and `auth.jwt()` exist in the verified target. Migration 2 of 41 creates RLS
 * policies that call them, and PostgreSQL resolves function calls while parsing,
 * so on a container without the Supabase `auth` schema that migration aborts
 * with a message that says nothing about what to do next. The check changes
 * nothing and refuses with the command to run instead:
 *
 *   npm run db:scratch:auth-preflight
 *
 * That command is deliberately NOT invoked automatically here. This wrapper's
 * contract is to validate a target and spawn Prisma; giving it a DDL step of
 * its own would make the deploy path impossible to reason about. The operator
 * runs the pre-flight explicitly, in the order shown above.
 *
 * `--database` must name an entry in `APPROVED_SCRATCH_DATABASES`
 * (`keebforge_e2e` or `keebforge_e2e_fresh`) and must agree with the database
 * named in `.env.e2e.local`, which is also where the password is read from.
 * Anything this wrapper cannot establish from those inputs is a refusal, never
 * a fallback.
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
import {
  AUTH_PREREQUISITE_SQL,
  evaluateAuthPrerequisite,
  type AuthPrerequisiteProbe,
} from "./migrate-scratch-plan";
import { ScratchTargetError, assertScratchPair, type Target } from "./scratch-guard";
import { LocalEnvError, resolveLocalEnv } from "./local-env";

/**
 * A refusal, carried as a value rather than acted on immediately.
 *
 * `process.exit()` never returns, so a `finally` block — and therefore the
 * `$disconnect()` that guards the deploy precondition — is skipped whenever a
 * refusal is raised while a client is open. Throwing lets that `finally` run;
 * the entry point converts the error back into the same non-zero exit and the
 * same two lines of output.
 */
export class RefusalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "RefusalError";
  }
}

/** Refuse by throwing, so cleanup on the way out still happens. */
function refuse(code: string, message: string): never {
  throw new RefusalError(code, message);
}

/** The two lines a refusal prints. Pure, so the CLI contract is testable. */
export function formatRefusal(error: RefusalError): string {
  return `REFUSED [${error.code}] ${error.message}\nNo database command was run.`;
}

/** A target that has passed every gate, ready to execute against. */
export type VerifiedPlan = {
  target: Target;
  childEnv: { DATABASE_URL: string; DIRECT_URL: string };
  command: string;
  args: string[];
};

/**
 * Every gate, in order, returning the verified plan.
 *
 * This used to run at module top level. It is a function now so that a refusal
 * becomes a rejected promise the entry point can format, instead of an
 * exception thrown during module evaluation — which would bypass the `catch`
 * below and print a stack trace where a refusal message used to be.
 */
async function resolveVerifiedPlan(): Promise<VerifiedPlan> {
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

  // Narrowed once, then destructured. TypeScript carries a `const`'s inferred type
  // into a closure but not a discriminant-based narrowing of a union, and the
  // phase below is async, so the values the async code reads are bound to names
  // whose type is already fixed.
  const { target, childEnv, command, args } = plan;

  // The explicit `--database` flag must agree with the validated file. A flag that
  // contradicts the configuration is an ambiguity, and ambiguity is a refusal.
  if (target.database !== localTarget.database) {
    refuse(
      "DATABASE_FLAG_MISMATCH",
      `--database ${target.database} contradicts ${localTarget.database}, which is the ` +
        "database validated in .env.e2e.local. Refusing rather than choosing between them.",
    );
  }

  // Second gate, immediately before the child process can exist. The planner
  // already ran this check; running it again here means the guard and the exec
  // are adjacent in the source, with no room for the environment to drift between
  // them. This is the same `assertScratchPair` the pre-flight uses, so both
  // entry points validate the connection target identically.
  try {
    assertScratchPair({
      databaseUrl: childEnv.DATABASE_URL,
      directUrl: childEnv.DIRECT_URL,
    });
  } catch (e) {
    if (e instanceof ScratchTargetError) refuse(e.code, e.message);
    throw e;
  }

  // Only the sanitized target is printed. Never the URL, the user or the password.
  return { target, childEnv, command, args };
}

/**
 * Read-only precondition, run before `prisma migrate deploy` and nothing else.
 *
 * Migration 20260819150000_rls_defense_in_depth — the second of 41 — creates 16
 * RLS policies that call auth.uid() or auth.jwt(). PostgreSQL resolves function
 * calls while parsing CREATE POLICY, so on a vanilla postgres:16 container the
 * migration aborts with an error about the missing `auth` schema, and the
 * replay stops there with a message that says nothing about what to do next.
 *
 * This turns that into one clear, actionable refusal. It changes nothing: the
 * probe is a single SELECT over `to_regprocedure`, which returns NULL for an
 * absent schema or function instead of raising, and names no table.
 *
 * `status` and `diff` are not gated. Neither applies migration 2, so neither can
 * fail on a missing schema, and forcing a connection on them would make the
 * read-only commands depend on a DDL step they do not need.
 */
async function assertAuthPrerequisiteBeforeDeploy(
  childEnv: VerifiedPlan["childEnv"],
): Promise<void> {
  // Both variables are pinned before `@prisma/client` is imported, because that
  // import loads `.env` — and `.env` holds the production DIRECT_URL. dotenv
  // never overwrites a key that is already set, so the verified values survive.
  process.env.DATABASE_URL = childEnv.DATABASE_URL;
  process.env.DIRECT_URL = childEnv.DIRECT_URL;

  const { PrismaClient } = await import("@prisma/client");
  // An explicit datasourceUrl, so the probe cannot resolve to anything other
  // than the target this file just proved is the scratch database.
  const prisma = new PrismaClient({ datasourceUrl: childEnv.DATABASE_URL });

  let found: AuthPrerequisiteProbe;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      AUTH_PREREQUISITE_SQL,
    )) as AuthPrerequisiteProbe[];
    const row = rows[0];
    found = { hasUid: row?.hasUid === true, hasJwt: row?.hasJwt === true };
  } catch {
    // Thrown, not exited: the `finally` below must run to disconnect. The
    // driver's own text can echo a connection string, so it is not repeated
    // here. `db:scratch:check` reports connectivity without that risk.
    throw new RefusalError(
      "AUTH_PREFLIGHT_UNREACHABLE",
      "Could not read the verified scratch database to check for the Supabase auth functions. " +
        "Nothing was changed. Run `npm run db:scratch:check` to diagnose connectivity first.",
    );
  } finally {
    // Reached on every path, including the refusal above and a failed probe,
    // because none of them exit the process.
    await prisma.$disconnect().catch(() => undefined);
  }

  const verdict = evaluateAuthPrerequisite(found);
  if (!verdict.ok) refuse(verdict.code, verdict.message);

  console.log("PRECONDITION auth.uid() and auth.jwt() both resolve (read-only check)");
}

async function run(plan: VerifiedPlan): Promise<void> {
  const { target, childEnv, command, args } = plan;

  // `args` is ["prisma", "migrate", <subcommand>, ...], so index 2 is the
  // subcommand the wrapper chose.
  if (args[2] === "deploy") {
    await assertAuthPrerequisiteBeforeDeploy(childEnv);
  }

  console.log("TARGET VERIFIED (loopback scratch database)");
  console.log(`  host     ${target.host}`);
  console.log(`  port     ${target.port}`);
  console.log(`  database ${target.database}`);
  console.log(`  command  npx ${args.join(" ")}`);
  console.log("  both DATABASE_URL and DIRECT_URL are pinned to this verified target");
  console.log("");

  const child = spawn(command, args, {
    stdio: "inherit",
    // The parent environment is inherited, then both connection variables are
    // overwritten with the verified values. A DIRECT_URL sourced from `.env` is
    // replaced here, never consulted.
    env: { ...process.env, ...childEnv },
  });

  child.on("error", (e) => {
    console.error(`Failed to start ${command}: ${e.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
}

// `process.exit` is deliberately absent from every path above. The two calls in
// the child-process handlers are fine: by then this process holds no Prisma
// connection and is only relaying the child's own exit status.
async function main(): Promise<void> {
  const plan = await resolveVerifiedPlan();
  await run(plan);
}

main().catch((e) => {
  if (e instanceof RefusalError) {
    console.error(formatRefusal(e));
    process.exitCode = 1;
    return;
  }
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});