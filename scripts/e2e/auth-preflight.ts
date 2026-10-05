#!/usr/bin/env node
/**
 * Scratch-only Supabase auth compatibility pre-flight.
 *
 *   npm run db:scratch:auth-preflight
 *   npm run db:scratch:auth-preflight -- --database keebforge_e2e_fresh
 *   npm run db:scratch:auth-preflight -- --database keebforge_e2e_fresh --teardown
 *
 * WHAT IT DOES
 *
 * Migration 20260819150000_rls_defense_in_depth creates 26 RLS policies, 16 of
 * which call auth.uid() or auth.jwt(). PostgreSQL resolves function calls while
 * it parses CREATE POLICY, so against a vanilla postgres:16-alpine container —
 * which has no `auth` schema — that migration aborts before creating anything.
 * It is migration 2 of 41, so a from-empty replay stops there.
 *
 * This command supplies those two functions from `scratch-auth.sql`, so the
 * replay can proceed. That is all it does.
 *
 * WHY IT IS NOT A MIGRATION
 *
 * `scratch-auth.sql` is deliberately outside prisma/migrations/. If it were a
 * migration, `prisma migrate deploy` would run `CREATE OR REPLACE FUNCTION
 * auth.uid()` against production as well, where that identical signature
 * silently replaces the genuine Supabase platform function with this stub — an
 * auth downgrade that raises no error. Keeping it here leaves all 41 existing
 * migration files byte-identical, so replaying them remains a faithful
 * rehearsal of the production history.
 *
 * WHY IT IS NOT AUTOMATIC
 *
 * `migrate-scratch.ts` does not invoke this. That wrapper's contract is to
 * validate a target and spawn Prisma; giving it a DDL capability of its own
 * would make the deploy path impossible to reason about. The operator runs this
 * explicitly, in order:
 *
 *   npm run db:scratch:check
 *   npm run db:scratch:auth-preflight
 *   npm run db:scratch:status -- --database keebforge_e2e_fresh
 *   npm run db:scratch:deploy  -- --database keebforge_e2e_fresh
 *
 * WHY STATEMENTS ARE SPLIT CLIENT-SIDE
 *
 * Prisma 6.19.3 routes raw SQL through its Rust query engine, which speaks the
 * PostgreSQL extended query protocol. That protocol binds one prepared statement
 * per execution, and the server rejects a multi-command Parse with "cannot
 * insert multiple commands into a prepared statement". Prisma's own contract
 * for $executeRaw/$executeRawUnsafe is likewise a single statement.
 *
 * So this file does not assume the driver will split for it. It splits the SQL
 * itself with a scanner that understands dollar-quoted bodies, string literals,
 * quoted identifiers and nested block comments, then issues one
 * $executeRawUnsafe call per statement. Without that, `CREATE SCHEMA` followed
 * by two `CREATE FUNCTION`s in one call would fail on the first semicolon.
 *
 * Everything that touches the database happens after the guard has passed. No
 * credential is ever printed: only host, port and database name are.
 */

import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  APPROVED_SCRATCH_DATABASES,
  ScratchTargetError,
  assertScratchPair,
  type Target,
} from "./scratch-guard";
import { LocalEnvError, resolveLocalEnv } from "./local-env";
import {
  AUTH_PREREQUISITE_SQL,
  evaluateAuthPrerequisite,
  type AuthPrerequisiteProbe,
} from "./migrate-scratch-plan";

/** The shim, resolved next to this file rather than from the working directory. */
export const SCRATCH_AUTH_SQL_FILE = "scratch-auth.sql";

/**
 * Teardown, as statements rather than as SQL text.
 *
 * `DROP SCHEMA … CASCADE` removes both functions AND every policy whose
 * expression references them — that is, all 16 auth-dependent policies from
 * migration 20260819150000. The remaining 10 policies would survive, and
 * re-running migration 2 could not restore the 16: it would fail on duplicate
 * policy names.
 *
 * So teardown is therefore refused on any database that carries evidence of
 * having been migrated. It exists for a database being prepared for a fresh
 * replay, not for undoing the shim on a live one.
 * `evaluateTeardownPrecondition` is that refusal, and it is pure.
 */
export const TEARDOWN_STATEMENTS: readonly string[] = ["DROP SCHEMA IF EXISTS auth CASCADE"];

/**
 * Read-only: does this database carry a Prisma migration ledger at all?
 *
 * Kept separate from the queries below because PostgreSQL resolves a missing
 * relation while it parses: one statement naming `_prisma_migrations` would
 * abort on a database that has no ledger, which is exactly the case the
 * no-ledger branch has to inspect. `to_regclass` yields NULL instead of raising.
 */
export const LEDGER_PROBE_SQL =
  "SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS \"hasLedger\"";

/**
 * Read-only: how many rows the ledger holds.
 *
 * Every row counts. A row with `finished_at IS NULL` is a failed or interrupted
 * migration, and it is still evidence that this database is not empty — so it
 * refuses exactly like a finished one does. Filtering on `finished_at IS NOT
 * NULL` here would make an interrupted ledger read as "no migrations" and let
 * the drop proceed.
 */
export const LEDGER_ROW_COUNT_SQL =
  'SELECT count(*)::int AS "rows" FROM public._prisma_migrations';

/**
 * Read-only: how many application relations the `public` schema holds.
 *
 * Only consulted when the ledger is absent. A missing ledger does NOT mean an
 * empty database — `prisma db push`, a restored dump that excluded the ledger,
 * or a dropped and recreated ledger all leave the 41 tables and 26 policies
 * behind with nothing to count. So "no ledger" is resolved by looking at the
 * schema directly instead of being trusted.
 *
 * relkind covers ordinary and partitioned tables, views, matviews and foreign
 * tables. Indexes are omitted because they belong to a relation that is already
 * counted, so counting them would double up without adding evidence.
 */
export const PUBLIC_RELATION_COUNT_SQL =
  "SELECT count(*)::int AS \"relations\" " +
  "FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace " +
  "WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f')";

/**
 * What teardown is allowed to conclude, gathered by `collectTeardownEvidence`.
 *
 * `ledger === undefined` means the probe did not answer — it threw, or returned
 * something other than a boolean. That is indistinguishable from "unknown", and
 * the evaluator refuses on it.
 */
export type TeardownEvidence = {
  ledger?: boolean;
  ledgerRows?: number;
  publicRelations?: number;
};

export type TeardownPrecondition =
  | { ok: true }
  | { ok: false; code: string; message: string };

function teardownRefusal(code: string, reason: string): TeardownPrecondition {
  return {
    ok: false,
    code,
    message:
      `Refusing to drop the auth schema: ${reason} ` +
      "DROP SCHEMA … CASCADE would take the 16 RLS policies that reference auth.uid()/auth.jwt() " +
      "with it, and migration 20260819150000 could not recreate them — it would fail on duplicate " +
      "policy names. Nothing was changed. Teardown is only safe on a database with no applied " +
      "migrations and no application schema, which is the case it exists for: preparing a fresh " +
      "replay.",
  };
}

/**
 * Decide whether the schema may be dropped.
 *
 * Pure, so every rule below is testable with no database. Both branches fail
 * closed: an unanswered question is a refusal, never permission.
 *
 *  - Ledger present: any row at all refuses, finished or not.
 *  - Ledger absent: any relation in `public` refuses, because a missing ledger
 *    does not mean an empty database.
 *  - Either probe failing, or returning a value that is not a finite
 *    non-negative number, refuses.
 */
export function evaluateTeardownPrecondition(evidence: TeardownEvidence): TeardownPrecondition {
  if (evidence.ledger === undefined) {
    return teardownRefusal(
      "UNDETERMINED_TEARDOWN_STATE",
      "the migration ledger probe did not return a usable answer.",
    );
  }

  if (evidence.ledger === true) {
    const rows = evidence.ledgerRows;
    if (typeof rows !== "number" || !Number.isFinite(rows) || rows < 0) {
      return teardownRefusal(
        "UNREADABLE_MIGRATION_HISTORY",
        "the migration ledger exists but its row count could not be read.",
      );
    }
    if (rows > 0) {
      return teardownRefusal(
        "REFUSING_TEARDOWN_ON_MIGRATED_DATABASE",
        `${rows} migration ledger row(s) are present, whether finished, failed or interrupted.`,
      );
    }
    return { ok: true };
  }

  const relations = evidence.publicRelations;
  if (typeof relations !== "number" || !Number.isFinite(relations) || relations < 0) {
    return teardownRefusal(
      "UNREADABLE_SCHEMA_STATE",
      "there is no migration ledger and the public schema could not be inspected.",
    );
  }
  if (relations > 0) {
    return teardownRefusal(
      "REFUSING_TEARDOWN_ON_POPULATED_SCHEMA",
      `the migration ledger is missing but public still holds ${relations} application relation(s), ` +
        "so this database has been migrated by some other means. A missing ledger is not an empty " +
        "database.",
    );
  }
  return { ok: true };
}

/**
 * Gather teardown evidence with read-only queries only.
 *
 * Takes an `execute` callback rather than a Prisma client, so the whole
 * decision path — including the failure paths — is exercised offline against a
 * fake. A query that throws or answers with something unexpected leaves its
 * field undefined, which the evaluator treats as "unknown" and refuses.
 */
export async function collectTeardownEvidence(
  execute: (sql: string) => Promise<unknown>,
): Promise<TeardownEvidence> {
  const evidence: TeardownEvidence = {};
  try {
    const ledgerRows = (await execute(LEDGER_PROBE_SQL)) as Array<{ hasLedger?: unknown }>;
    const hasLedger = ledgerRows?.[0]?.hasLedger;

    if (hasLedger === true) {
      evidence.ledger = true;
      const rows = (await execute(LEDGER_ROW_COUNT_SQL)) as Array<{ rows?: unknown }>;
      const count = rows?.[0]?.rows;
      if (typeof count === "number" && Number.isFinite(count)) evidence.ledgerRows = count;
      return evidence;
    }

    if (hasLedger === false) {
      evidence.ledger = false;
      const relations = (await execute(PUBLIC_RELATION_COUNT_SQL)) as Array<{
        relations?: unknown;
      }>;
      const count = relations?.[0]?.relations;
      if (typeof count === "number" && Number.isFinite(count)) evidence.publicRelations = count;
      return evidence;
    }

    // Neither true nor false: the probe's answer is not a boolean, so `ledger`
    // stays undefined and the evaluator refuses.
    return evidence;
  } catch {
    return evidence;
  }
}

export type AuthMode = "apply" | "teardown";

export type AuthArgs =
  | { ok: true; help: true }
  | { ok: true; help: false; database: string; mode: AuthMode }
  | { ok: false; code: string; message: string };

const USAGE = [
  "Usage: npm run db:scratch:auth-preflight -- [options]",
  "",
  "Creates the Supabase auth compatibility shim (auth schema, auth.uid(), auth.jwt())",
  "in an approved scratch database, so that migration 20260819150000_rls_defense_in_depth",
  "can create its RLS policies.",
  "",
  "Options:",
  "  --database <name>   Required. Must be on the approved scratch allowlist:",
  `                      ${APPROVED_SCRATCH_DATABASES.join(", ")}`,
  "  --teardown          Drop the auth schema instead of creating it.",
  "  -h, --help          Show this message.",
].join("\n");

function fail(code: string, message: string): AuthArgs {
  return { ok: false, code, message };
}

/**
 * Parse and validate the arguments.
 *
 * Fail-closed and deliberately stricter than the Prisma wrapper: an argument
 * this function does not recognise is refused rather than ignored, because a
 * silently dropped `--teardown` would apply the shim when the operator asked to
 * remove it.
 *
 * `--database` must be named explicitly. There is no default, so the command
 * can never act on a database the operator did not state.
 */
export function preflightAuthArgs(argv: readonly string[]): AuthArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { ok: true, help: true };
  }

  let database: string | undefined;
  let mode: AuthMode = "apply";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;

    const takeValue = (name: string): string | undefined => {
      if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("-")) return undefined;
      i += 1;
      return next;
    };

    if (arg === "--database" || arg.startsWith("--database=")) {
      const v = takeValue("--database");
      if (v === undefined) return fail("MISSING_VALUE", "--database requires a value");
      database = v;
    } else if (arg === "--teardown") {
      mode = "teardown";
    } else if (arg.startsWith("-")) {
      return fail(
        "UNKNOWN_ARGUMENT",
        `Refusing unrecognised option "${arg}". This command accepts only --database, ` +
          "--teardown and --help. It never forwards unknown arguments, because an ignored " +
          "--teardown would apply the shim when removal was asked for.",
      );
    } else {
      return fail(
        "UNEXPECTED_ARGUMENT",
        `Refusing positional argument "${arg}". Everything must be a named option: ${USAGE}`,
      );
    }
  }

  if (database === undefined) {
    return fail(
      "NO_DATABASE_ARGUMENT",
      `--database is required and must be named explicitly. Approved scratch databases: ` +
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

  return { ok: true, help: false, database, mode };
}

/**
 * Split a SQL script into individual statements.
 *
 * A `;` only terminates a statement when it is not inside a dollar-quoted
 * body, a string literal, a quoted identifier, or a comment. Both function
 * definitions in `scratch-auth.sql` contain semicolons inside `$$ … $$`, so a
 * naive `split(";")` would produce unrunnable fragments and the third one would
 * be syntactically invalid.
 *
 * Handled: `--` line comments; `/* … *\/` block comments including nesting,
 * which PostgreSQL allows; `'…'` literals with `''` escapes; `"…"` identifiers
 * with `""` escapes; and `$tag$ … $tag$` dollar quoting for any tag, including
 * the empty `$$`. A `$` that is not a valid tag opener (`$1` parameters) is
 * ordinary text.
 *
 * Statement text keeps its internal newlines so PostgreSQL sees valid syntax.
 * Comments are discarded, so the script can be commented freely without the
 * output being affected. Pure, and therefore unit-tested with no database.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  let dollarTag: string | null = null;

  const dollarTagAt = (pos: number): string | null => {
    if (sql[pos] !== "$") return null;
    const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(pos, pos + 64));
    return match ? match[0] : null;
  };

  while (i < sql.length) {
    const ch = sql[i]!;

    if (dollarTag !== null) {
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag;
        i += dollarTag.length;
        dollarTag = null;
        continue;
      }
      current += ch;
      i += 1;
      continue;
    }

    if (ch === "-" && sql[i + 1] === "-") {
      const newline = sql.indexOf("\n", i);
      i = newline === -1 ? sql.length : newline;
      continue;
    }

    if (ch === "/" && sql[i + 1] === "*") {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth -= 1;
          i += 2;
        } else {
          i += 1;
        }
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      const quote = ch;
      current += ch;
      i += 1;
      while (i < sql.length) {
        current += sql[i];
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            current += sql[i + 1]!;
            i += 2;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    const tag = dollarTagAt(i);
    if (tag !== null) {
      dollarTag = tag;
      current += tag;
      i += tag.length;
      continue;
    }

    if (ch === ";") {
      const trimmed = current.trim();
      if (trimmed !== "") statements.push(trimmed);
      current = "";
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail !== "") statements.push(tail);
  return statements;
}

/** Read the shim from beside this file, never from the working directory. */
export function loadScratchAuthSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, SCRATCH_AUTH_SQL_FILE), "utf8");
}

/**
 * A refusal, carried as a value rather than acted on immediately.
 *
 * `process.exit()` terminates the process at once and never returns, so a
 * `finally` block — and therefore `$disconnect()` — is skipped whenever a
 * refusal is raised while a client is open. Throwing instead lets the enclosing
 * `finally` run, and the entry point turns the error into the same non-zero exit
 * plus the same two lines of output. The CLI contract is unchanged; only the
 * cleanup path is.
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
export function refuse(code: string, message: string): never {
  throw new RefusalError(code, message);
}

/** The two lines a refusal prints. Pure, so the CLI contract is testable. */
export function formatRefusal(error: RefusalError, trailer = "Nothing was changed."): string {
  return `REFUSED [${error.code}] ${error.message}\n${trailer}`;
}

/** Turn a refusal into a non-zero exit without killing pending cleanup. */
export function reportRefusal(error: RefusalError, trailer = "Nothing was changed."): void {
  console.error(formatRefusal(error, trailer));
  process.exitCode = 1;
}

/**
 * Read-only existence probe. One query, no writes, no table references.
 */
async function probeAuthFunctions(
  execute: (sql: string) => Promise<unknown>,
): Promise<AuthPrerequisiteProbe> {
  const rows = (await execute(AUTH_PREREQUISITE_SQL)) as AuthPrerequisiteProbe[];
  const row = rows[0];
  return { hasUid: row?.hasUid === true, hasJwt: row?.hasJwt === true };
}

async function main(): Promise<void> {
  try {
    await runPreflight();
  } catch (e) {
    if (e instanceof RefusalError) {
      reportRefusal(e);
      return;
    }
    throw e;
  }
}

async function runPreflight(): Promise<void> {
  const args = preflightAuthArgs(process.argv.slice(2));
  if (!args.ok) refuse(args.code, args.message);
  if (args.help) {
    console.log(USAGE);
    return;
  }

  // ── guard first, database second ─────────────────────────────────────────
  // Nothing above this line can open a socket or load .env.
  let local: ReturnType<typeof resolveLocalEnv>;
  try {
    local = resolveLocalEnv();
  } catch (e) {
    if (e instanceof LocalEnvError) refuse(e.code, e.message);
    throw e;
  }

  // An explicit --database that contradicts the validated file is an ambiguity,
  // not something to resolve by preference. Same rule as migrate-scratch.ts.
  if (args.database !== local.target.database) {
    refuse(
      "DATABASE_FLAG_MISMATCH",
      `--database ${args.database} contradicts ${local.target.database}, which is the database ` +
        "validated in .env.e2e.local. Refusing rather than choosing between them.",
    );
  }

  // Re-run the pair guard on the exact strings, immediately before connecting,
  // so the guard and the connect are adjacent and nothing can drift between.
  try {
    assertScratchPair({ databaseUrl: local.databaseUrl, directUrl: local.directUrl });
  } catch (e) {
    if (e instanceof ScratchTargetError) refuse(e.code, e.message);
    throw e;
  }

  const target: Target = local.target;
  const password = decodeURIComponent(new URL(local.databaseUrl).password);
  if (password === "") {
    refuse(
      "MISSING_PASSWORD",
      "DATABASE_URL in .env.e2e.local carries no password. Add one so the disposable " +
        "container can authenticate.",
    );
  }

  // Pin both variables before @prisma/client is imported. That import loads
  // .env, and dotenv never overwrites a key that is already set — so the
  // verified values survive and .env's production DIRECT_URL cannot reappear
  // behind the guard.
  process.env.DATABASE_URL = local.databaseUrl;
  process.env.DIRECT_URL = local.directUrl;

  const mode: AuthMode = args.mode;
  console.log("TARGET VERIFIED (loopback scratch database)");
  console.log(`  host     ${target.host}`);
  console.log(`  port     ${target.port}`);
  console.log(`  database ${target.database}`);
  console.log(`  mode     ${mode}`);
  console.log("");

  // Only now, with the guard passed, is a client constructed — and with an
  // explicit datasourceUrl rather than whatever the environment resolves to.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: local.databaseUrl });

  try {
    if (mode === "teardown") {
      // Refuse before dropping anything. Read-only, and fail-closed: the
      // evidence decides, and an unanswered question is a refusal. This is the
      // only thing standing between an operator and the silent loss of the 16
      // RLS policies.
      const evidence = await collectTeardownEvidence((sql) => prisma.$queryRawUnsafe(sql));
      const allowed = evaluateTeardownPrecondition(evidence);
      if (!allowed.ok) refuse(allowed.code, allowed.message);

      for (const statement of TEARDOWN_STATEMENTS) {
        await prisma.$executeRawUnsafe(statement);
      }
      console.log(`DROPPED the auth schema (${TEARDOWN_STATEMENTS.length} statement)`);

      const after = await probeAuthFunctions((sql) => prisma.$queryRawUnsafe(sql));
      if (evaluateAuthPrerequisite(after).ok) {
        throw new Error(
          "teardown reported success but auth.uid() and auth.jwt() still resolve. " +
            "The scratch database is not in the state this command claims.",
        );
      }
      console.log("VERIFIED both functions no longer resolve");
      return;
    }

    const sql = loadScratchAuthSql();
    const statements = splitSqlStatements(sql);
    if (statements.length === 0) {
      throw new Error(`${SCRATCH_AUTH_SQL_FILE} contains no executable statement`);
    }

    // One call per statement. See the header: the extended query protocol binds
    // exactly one command, so the file must be split before it is sent.
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(statement);
    }
    console.log(`APPLIED ${SCRATCH_AUTH_SQL_FILE} (${statements.length} statements, one per round trip)`);

    const after = await probeAuthFunctions((sql) => prisma.$queryRawUnsafe(sql));
    const verdict = evaluateAuthPrerequisite(after);
    if (!verdict.ok) {
      throw new Error(
        `the shim was applied but the functions do not resolve: ${verdict.message}`,
      );
    }
    console.log("VERIFIED auth.uid() and auth.jwt() both resolve");
    console.log("");
    console.log("Next: npm run db:scratch:status -- --database " + target.database);
    console.log("      npm run db:scratch:deploy  -- --database " + target.database);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Only run when this file is the process entry point.
 *
 * A false negative here would make the command silently do nothing, so the test
 * suite pins the guard's presence and exercises the refusal paths directly.
 */
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch((e) => {
    // A RefusalError is handled inside `main`. Reaching here means an
    // unexpected failure, so report it as one rather than as a refusal.
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  });
}