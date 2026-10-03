/**
 * Migration-run planner for the disposable scratch database.
 *
 * Pure: it decides and reports, and never spawns anything. `migrate-scratch.mjs`
 * is a thin shim that runs the plan.
 *
 * The wrapper exists because `prisma migrate deploy` will follow `DIRECT_URL`
 * from `.env` even when `DATABASE_URL` is overridden. Rather than trusting the
 * operator to set both variables correctly, this builds both from the same
 * verified inputs, re-runs the guard immediately before the command starts, and
 * refuses subcommands that are destructive by project policy.
 *
 * It fails closed. If the target cannot be established from explicit arguments,
 * there is no plan and the caller must not proceed.
 */

import {
  APPROVED_SCRATCH_DATABASES,
  SCRATCH_HOSTS,
  SCRATCH_PORT,
  ScratchTargetError,
  assertScratchPair,
  type Target,
} from "./scratch-guard";

/**
 * Prisma subcommands a scratch validation is allowed to run.
 *
 * `dev` is excluded because it needs a shadow database and this project's setup
 * cannot build one. `reset` is never permitted. `resolve` is never permitted —
 * it rewrites the migration ledger without applying anything, which is how a
 * genuine history defect gets hidden instead of fixed.
 */
export const SAFE_SUBCOMMANDS: readonly string[] = ["deploy", "status", "diff"];

/**
 * The subset of the environment this planner reads.
 *
 * Deliberately narrower than `NodeJS.ProcessEnv`: Next.js augments that type
 * with a required `NODE_ENV`, which would force every test and caller to
 * fabricate one. Reading a single optional key needs no such ceremony.
 */
export type ScratchEnv = Record<string, string | undefined>;

export type Plan =
  | {
      ok: true;
      target: Target;
      childEnv: { DATABASE_URL: string; DIRECT_URL: string };
      command: string;
      args: string[];
    }
  | { ok: false; code: string; message: string };

function fail(code: string, message: string): Plan {
  return { ok: false, code, message };
}

/**
 * Build a PostgreSQL URL from discrete parts.
 *
 * The password is interpolated here and nowhere else, and the result is only
 * ever returned inside `childEnv` — never logged. Credentials are percent
 * encoded so that a password containing `@` or `:` cannot restructure the URL
 * into a different host.
 */
export function buildConnectionUrl(parts: {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}): string {
  const auth = `${encodeURIComponent(parts.user)}:${encodeURIComponent(parts.password)}`;
  return `postgresql://${auth}@${parts.host}:${parts.port}/${encodeURIComponent(parts.database)}`;
}

/**
 * Validate the subcommand alone, before any environment is consulted.
 *
 * Exists so the executor can reject `reset` and `dev` without first reading a
 * configuration file. Whether a subcommand is acceptable is a property of the
 * request, not of this machine's setup, so it must not be masked by a
 * "no local env file" error — otherwise the refusal a caller sees depends on
 * which files happen to exist, which is the order-dependent ambiguity these
 * guards exist to remove.
 */
export function preflightSubcommand(
  argv: readonly string[],
): { ok: true } | { ok: false; code: string; message: string } {
  const subcommand = argv.find((a) => !a.startsWith("-"));
  if (!subcommand) {
    return {
      ok: false,
      code: "NO_SUBCOMMAND",
      message:
        `No Prisma subcommand given. Usage: migrate-scratch <deploy|status|diff> --database <name> ` +
        `-- [--extra prisma args]`,
    };
  }
  if (!SAFE_SUBCOMMANDS.includes(subcommand)) {
    return {
      ok: false,
      code: "UNSAFE_SUBCOMMAND",
      message:
        `Refusing subcommand "${subcommand}". This wrapper permits only ` +
        `${SAFE_SUBCOMMANDS.join(", ")}. \`dev\`, \`reset\` and \`resolve\` are not permitted: ` +
        `reset is destructive and resolve rewrites the migration ledger without applying anything.`,
    };
  }
  return { ok: true };
}

/**
 * Decide what the wrapper should run, or why it must not.
 *
 * `argv` is the argument list after the script name.
 * `env` is the parent environment, read only for the scratch password.
 */
export function planMigrationRun(argv: readonly string[], env: ScratchEnv): Plan {
  // ── subcommand ──────────────────────────────────────────────────────────
  const sub = preflightSubcommand(argv);
  if (!sub.ok) return fail(sub.code, sub.message);
  // Same lookup `preflightSubcommand` performs, hoisted so the final command can
  // name it. Kept adjacent to the validation above so the two cannot drift.
  const subcommand = argv.find((a) => !a.startsWith("-"))!;

  // ── named arguments ─────────────────────────────────────────────────────
  let database: string | undefined;
  let host = "localhost";
  let port = SCRATCH_PORT;
  let user = "postgres";

  // Prisma passthrough arguments, i.e. everything that is not one of the four
  // wrapper-only flags below. `dbcheck` deliberately swallows none of these:
  // an argument the wrapper does not recognise is forwarded untouched, so a new
  // Prisma flag can never be silently dropped.
  const passthrough: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    // Everything after a bare `--` is forwarded verbatim and never interpreted.
    if (arg === "--") {
      passthrough.push(...argv.slice(i + 1));
      break;
    }

    const isFlag = (name: string) => arg === name || arg.startsWith(`${name}=`);
    // Consume the value that follows a flag written in `--flag value` form.
    const takeValue = (name: string): string | undefined => {
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) return undefined;
      i += 1;
      return next;
    };

    if (isFlag("--database")) {
      database = takeValue("--database");
      if (database === undefined) return fail("MISSING_VALUE", "--database requires a value");
    } else if (isFlag("--host")) {
      const v = takeValue("--host");
      if (v === undefined) return fail("MISSING_VALUE", "--host requires a value");
      host = v;
    } else if (isFlag("--port")) {
      const v = takeValue("--port");
      if (v === undefined) return fail("MISSING_VALUE", "--port requires a value");
      port = Number(v);
    } else if (isFlag("--user")) {
      const v = takeValue("--user");
      if (v === undefined) return fail("MISSING_VALUE", "--user requires a value");
      user = v;
    } else {
      passthrough.push(arg);
    }
  }

  // ── target must be established from explicit arguments ──────────────────
  if (database === undefined) {
    return fail(
      "NO_DATABASE_ARGUMENT",
      `--database is required and must be explicitly approved. Known scratch databases: ` +
        `${APPROVED_SCRATCH_DATABASES.join(", ")}. Refusing to guess.`,
    );
  }
  if (!APPROVED_SCRATCH_DATABASES.includes(database)) {
    return fail(
      "UNAPPROVED_DATABASE",
      `Database "${database}" is not on the approved scratch allowlist ` +
        `(${APPROVED_SCRATCH_DATABASES.join(", ")}). Refusing.`,
    );
  }
  if (!SCRATCH_HOSTS.includes(host)) {
    return fail("REMOTE_HOST", `Host "${host}" is not a loopback address. Refusing.`);
  }
  if (port !== SCRATCH_PORT) {
    const shown = Number.isNaN(port) ? "a non-numeric value" : `port ${port}`;
    return fail(
      "WRONG_PORT",
      `${shown} is not the scratch port ${SCRATCH_PORT}. Refusing.`,
    );
  }

  // ── credential comes from the operator, never from .env ─────────────────
  const password = env.SCRATCH_DB_PASSWORD;
  if (!password || password === "") {
    return fail(
      "NO_PASSWORD",
      `SCRATCH_DB_PASSWORD is not set. It must be provided explicitly for the disposable container; ` +
        `this wrapper never reads .env for credentials.`,
    );
  }

  const url = buildConnectionUrl({ host, port, database, user, password });

  // ── final gate, immediately before the command would start ──────────────
  let target: Target;
  try {
    target = assertScratchPair({ databaseUrl: url, directUrl: url }).databaseUrl;
  } catch (e) {
    if (e instanceof ScratchTargetError) return fail(e.code, e.message);
    throw e;
  }

  // The subcommand is positioned by the wrapper, so drop the single occurrence
  // the scan above picked up. A later positional argument that merely repeats
  // the name is left alone.
  const rest = [...passthrough];
  const at = rest.indexOf(subcommand);
  if (at !== -1) rest.splice(at, 1);

  return {
    ok: true,
    target,
    // Both variables are set to the identical verified URL, so the CLI cannot
    // prefer DIRECT_URL and end up somewhere else. Any DIRECT_URL inherited
    // from .env is overwritten rather than consulted.
    childEnv: { DATABASE_URL: url, DIRECT_URL: url },
    command: "npx",
    args: ["prisma", subcommand, ...rest],
  };
}