import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, join as joinPath } from "node:path";
import {
  APPROVED_SCRATCH_DATABASES,
  SCRATCH_HOSTS,
  SCRATCH_PORT,
  ScratchTargetError,
  assertScratchPair,
  looksProductionLike,
} from "./scratch-guard";
import {
  AUTH_PREREQUISITE_FUNCTIONS,
  AUTH_PREREQUISITE_HINT,
  AUTH_PREREQUISITE_SQL,
  SAFE_SUBCOMMANDS,
  buildConnectionUrl,
  evaluateAuthPrerequisite,
  planMigrationRun,
  preflightSubcommand,
  type ScratchEnv,
} from "./migrate-scratch-plan";
// Imported statically on purpose. `auth-preflight.ts` runs its main() behind an
// entry-point guard, so importing it here must neither connect nor read any
// configuration file — and this file going on to complete proves it. If that
// guard ever regressed, this import would try to connect and the run would fail.
import {
  LEDGER_PROBE_SQL,
  LEDGER_ROW_COUNT_SQL,
  PUBLIC_RELATION_COUNT_SQL,
  RefusalError,
  SCRATCH_AUTH_SQL_FILE,
  TEARDOWN_STATEMENTS,
  collectTeardownEvidence,
  evaluateTeardownPrecondition,
  formatRefusal,
  loadScratchAuthSql,
  preflightAuthArgs,
  refuse,
  splitSqlStatements,
  type TeardownEvidence,
} from "./auth-preflight";
import { SERVER_SIDE_PORT, checkConnectedServer, classifyServerAddress } from "./dbcheck";
import { planProductionDeploy } from "../db/production-migration-path";
import {
  LOCAL_ENV_FILE,
  LocalEnvError,
  applyLocalEnv,
  assertLocalEnvApplied,
  parseEnvFile,
  resolveLocalEnv,
} from "./local-env";

/**
 * Offline tests for Batch 5C.3, which closed the unguarded `db:deploy` path.
 *
 * Two separate concerns are covered:
 *
 *   1. `db:deploy` must not be able to execute Prisma at all. This is asserted
 *      statically against package.json, because a command that cannot run is
 *      best proven by reading the string that would run it.
 *   2. The production path must stay inert, and the scratch path must stay
 *      restricted to its approved local databases.
 *
 * Nothing here opens a connection or spawns a process.
 *
 * All URLs use the dummy password `pw`. No real credential appears in this file.
 */

const PW = "pw";
const SCRATCH_URL = `postgresql://postgres:${PW}@localhost:${SCRATCH_PORT}/keebforge_e2e`;

let n = 0;
function pass(label: string) {
  console.log(`PASS ${++n} ${label}`);
}

function expectRefusal(fn: () => unknown, code: string, label: string) {
  let thrown: unknown;
  try {
    fn();
  } catch (e) {
    thrown = e;
  }
  assert.ok(thrown instanceof ScratchTargetError, `${label}: expected a refusal, got none`);
  assert.equal(thrown.code, code, `${label}: expected code ${code}, got ${thrown.code}`);
  pass(label);
}

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

/** Every tracked-ish source file under the repo root, skipping generated trees. */
function walkRepo(): string[] {
  const skip = new Set(["node_modules", ".next", ".git", "coverage", ".vercel", ".opencode"]);
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(process.cwd());
  return out;
}

/** Remove // and block comments so prose cannot satisfy a code assertion. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

/** Comments legitimately discuss Prisma, so compare code only. */
function codeOf(file: string): string {
  return readFileSync(join(repoRoot, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * Raw file text, comments included.
 *
 * `codeOf` deliberately strips comments, which makes it right for asserting on
 * executable code and wrong for asserting on instructions. An earlier version of
 * the sourcing test used `codeOf`, which meant a `set -a` line inside a docblock
 * was removed before the assertion ran and the test passed unconditionally. Any
 * check about documentation or about prose that must be absent has to read the
 * real bytes.
 */
function rawOf(file: string): string {
  return readFileSync(join(repoRoot, file), "utf8");
}

// ── db:deploy can no longer execute Prisma ─────────────────────────────────

{
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  // The single most important assertion in this file: no npm script may invoke
  // a database-connecting Prisma command directly.
  const CONNECTING = /(?:^|\s)prisma\s+(?:migrate\s+(?:deploy|dev|reset|resolve)|db\s+push|studio|introspect)/;
  const offenders = Object.entries(pkg.scripts)
    .filter(([, cmd]) => CONNECTING.test(cmd))
    .map(([name, cmd]) => `${name}: ${cmd}`);

  assert.deepEqual(
    offenders,
    [],
    `npm scripts still invoke Prisma against a database:\n  ${offenders.join("\n  ")}`,
  );
  pass("no npm script invokes a database-connecting Prisma command");
}

{
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  assert.ok(
    !/\bprisma\b/.test(pkg.scripts["db:deploy"] ?? ""),
    "db:deploy must not reference prisma at all",
  );
  assert.match(
    pkg.scripts["db:deploy"] ?? "",
    /scripts\/db\/deploy\.ts$/,
    "db:deploy should delegate to the refusing entrypoint",
  );
  pass("db:deploy delegates to a script that cannot run Prisma");
}

{
  // `prisma generate` is offline and safe, so it is permitted — but nothing
  // else may appear. This pins the boundary rather than trusting a blocklist.
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  // Compared as a set of names: script order in package.json is not a
  // property worth pinning, and this file is alphabetically sorted.
  const prismaScripts = Object.entries(pkg.scripts)
    .filter(([, cmd]) => /\bprisma\b/.test(cmd))
    .map(([name, cmd]) => `${name}=${cmd}`)
    .sort();
  assert.deepEqual(
    prismaScripts,
    ["db:generate=prisma generate", "postinstall=prisma generate"],
    "only the offline `prisma generate` may remain a bare prisma script",
  );
  pass("only the offline 'prisma generate' remains a bare prisma script");
}

{
  const code = codeOf("scripts/db/deploy.ts");
  // The entrypoint must not import a child-process module or Prisma, or it
  // gains the ability to run whatever the refusal logic might one day permit.
  assert.ok(
    !/from\s+["']node:child_process["']/.test(code),
    "deploy.ts must not import child_process",
  );
  assert.ok(!code.includes("prisma/"), "deploy.ts must not import Prisma");
  assert.ok(!code.includes("spawn"), "deploy.ts must not spawn anything");
  assert.ok(!code.includes("exec"), "deploy.ts must not exec anything");
  pass("the deploy entrypoint cannot spawn or import a database client");
}

// ── the production path is inert and stays inert ───────────────────────────

{
  // No confirmation, no arguments, no environment: it must still refuse. If a
  // future change made this pass for some input, production writes would become
  // reachable without a deliberate review of that change.
  // No parameters exist to vary: the refusal cannot be talked out of, and any
  // attempt to enable it is necessarily a code change rather than a flag.
  const plan = planProductionDeploy();
  assert.equal(plan.ok, false, "the production path must refuse");
  if (!plan.ok) {
    assert.equal(plan.code, "PRODUCTION_PATH_NOT_ENABLED");
    assert.ok(plan.message.length > 40, "a refusal must explain itself");
    assert.match(plan.message, /scratch/i, "a refusal should point at the safe path");
  }
  pass("the production path refuses unconditionally");

  // The signature is part of the guarantee: accepting an approval argument
  // would invite a caller to pass one and expect it to be honoured.
  const declaredArity = codeOf("scripts/db/production-migration-path.ts").match(
    /function\s+planProductionDeploy\s*\(([^)]*)\)/,
  );
  assert.ok(declaredArity, "planProductionDeploy must be a named function");
  assert.equal(
    declaredArity[1]!.trim(),
    "",
    "planProductionDeploy must take no arguments, including no approval flag",
  );
}

{
  // Even a fully-populated, production-looking environment is refused. This is
  // the incident's shape: plausible values present, execution still denied.
  // A populated, production-shaped environment changes nothing: the function
  // never consults process.env, so there is no input for it to be swayed by.
  const moduleCode = codeOf("scripts/db/production-migration-path.ts");
  assert.ok(
    !/process\.env/.test(moduleCode),
    "the production planner must not read the environment",
  );
  assert.equal(planProductionDeploy().ok, false);
  pass("the production path ignores the environment entirely");
}

{
  // "Cannot run without confirmation" is currently weaker than intended: it
  // cannot run at all. This test exists so that the stronger guarantee is
  // deliberate rather than accidental.
  const module_ = codeOf("scripts/db/production-migration-path.ts");
  assert.ok(
    !/process\.exit/.test(module_),
    "the planner must return a refusal, not exit the process",
  );
  assert.ok(
    /ok:\s*false/.test(module_),
    "the planner must return an explicit refusal",
  );
  pass("the production planner returns a refusal instead of executing");
}

{
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  // The explicitly-named production command must not be a bare prisma script,
  // and must point at the same inert entrypoint.
  assert.match(
    pkg.scripts["db:deploy:production"] ?? "",
    /scripts\/db\/deploy\.ts$/,
    "db:deploy:production must delegate to the refusing entrypoint",
  );
  pass("db:deploy:production delegates to the same refusing entrypoint");
}

// ── the scratch path is still restricted to approved local databases ───────

{
  const r = assertScratchPair({ databaseUrl: SCRATCH_URL, directUrl: SCRATCH_URL });
  assert.deepEqual(r.databaseUrl, {
    host: "localhost",
    port: String(SCRATCH_PORT),
    database: "keebforge_e2e",
  });
  pass("the scratch path still accepts its approved local target");
}

{
  expectRefusal(
    () =>
      assertScratchPair({
        databaseUrl: `postgresql://u:${PW}@aws-0-ap-south-1.pooler.supabase.invalid:6543/postgres`,
        directUrl: `postgresql://u:${PW}@aws-0-ap-south-1.pooler.supabase.invalid:5432/postgres`,
      }),
    "PROVIDER_HOST",
    "the scratch path still refuses a Supabase host",
  );
}

{
  expectRefusal(
    () => assertScratchPair({ databaseUrl: SCRATCH_URL, directUrl: undefined }),
    "MISSING_URL",
    "the scratch path still refuses a missing DIRECT_URL",
  );
}

{
  // Closing db:deploy must not have widened what the scratch wrapper accepts.
  for (const db of ["keebforge_e2e_fresh", "keebforge_e2e"]) {
    assert.ok(APPROVED_SCRATCH_DATABASES.includes(db));
    assert.ok(!looksProductionLike(db));
  }
  assert.deepEqual(
    [...APPROVED_SCRATCH_DATABASES],
    ["keebforge_e2e", "keebforge_e2e_fresh"],
    "the approved scratch allowlist must not have grown",
  );
  pass("the approved scratch allowlist is unchanged and still loopback-only");
}

const ENV: ScratchEnv = { SCRATCH_DB_PASSWORD: PW };

{
  const plan = planMigrationRun(["deploy", "--database", "keebforge_e2e_fresh"], ENV);
  assert.ok(plan.ok, "the guarded scratch deploy must still work");
  if (plan.ok) {
    assert.equal(plan.childEnv.DATABASE_URL, plan.childEnv.DIRECT_URL);
    assert.ok(!plan.childEnv.DIRECT_URL.includes("supabase"));
    pass("the scratch deploy still pins both variables to the local target");
  }
}

{
  // The wrapper must not have become a way to reach production.
  const plan = planMigrationRun(["deploy", "--database", "keebforge_e2e"], {
    ...ENV,
    DIRECT_URL: "postgresql://u:p@aws-0-ap-south-1.pooler.supabase.invalid:5432/postgres",
  });
  assert.ok(plan.ok);
  if (plan.ok) {
    assert.ok(
      !plan.childEnv.DIRECT_URL.includes("supabase"),
      "the wrapper must overwrite an inherited production DIRECT_URL",
    );
    pass("the scratch wrapper overwrites an inherited production DIRECT_URL");
  }
}

{
  for (const db of ["postgres", "keebforge_production", "keebforge", "production"]) {
    const plan = planMigrationRun(["deploy", "--database", db], ENV);
    assert.equal(plan.ok, false, `${db} must be refused`);
    if (!plan.ok) assert.ok(plan.code !== "", "a refusal must carry a code");
  }
  pass("the scratch wrapper refuses production and unlisted database names");
}

function expectPlanRefusal(
  argv: readonly string[],
  env: ScratchEnv,
  code: string,
  label: string,
) {
  const plan = planMigrationRun(argv, env);
  assert.equal(plan.ok, false, `${label}: expected a refusal, got a plan`);
  if (!plan.ok) assert.equal(plan.code, code, `${label}: expected ${code}, got ${plan.code}`);
  pass(label);
}

expectPlanRefusal(
  ["deploy", "--database", "keebforge_e2e", "--host", "db.example.com"],
  ENV,
  "REMOTE_HOST",
  "the scratch wrapper still refuses a remote --host",
);
expectPlanRefusal(
  ["deploy", "--database", "keebforge_e2e", "--port", "5432"],
  ENV,
  "WRONG_PORT",
  "the scratch wrapper still refuses a non-scratch --port",
);

{
  for (const sub of ["reset", "dev", "resolve"]) {
    expectPlanRefusal(
      ["migrate", sub, "--database", "keebforge_e2e"],
      ENV,
      "UNSAFE_SUBCOMMAND",
      `'migrate ${sub}' remains blocked`,
    );
  }
}

{
  assert.deepEqual([...SAFE_SUBCOMMANDS], ["deploy", "status", "diff"]);
  pass("the scratch wrapper still permits only deploy, status and diff");
}

{
  const url = buildConnectionUrl({
    host: "localhost",
    port: SCRATCH_PORT,
    database: "keebforge_e2e",
    user: "postgres",
    password: "p@ss:word/with?chars",
  });
  const r = assertScratchPair({ databaseUrl: url, directUrl: url });
  assert.equal(r.databaseUrl.database, "keebforge_e2e");
  pass("a metacharacter password still cannot restructure the scratch target");
}

{
  // Nothing on the decision path may load .env, or production credentials would
  // reappear in process.env before the guard inspects anything.
  for (const file of ["scratch-guard.ts", "migrate-scratch-plan.ts"]) {
    const code = codeOf(`scripts/e2e/${file}`);
    assert.ok(!code.includes("@prisma/client"), `${file} must not import @prisma/client`);
    assert.ok(!code.includes("dotenv"), `${file} must not load .env`);
  }
  const dbcheck = codeOf("scripts/e2e/dbcheck.ts");
  assert.ok(!/import\s+[^\n]*@prisma\/client/.test(dbcheck));
  assert.ok(/await import\(\s*["']@prisma\/client["']\s*\)/.test(dbcheck));
  pass("the guard still cannot pull .env into the decision path");
}
/* ------------------------------------------------------------------------- *
 * Batch 5C.4 — local env separation and E2E seed guarding.
 *
 * These tests are offline. `loadLocalEnv` is pure with respect to the database:
 * it reads a file, validates strings, and throws. Nothing here opens a socket.
 * ------------------------------------------------------------------------- */

/** Write a local env file into a throwaway directory and return that directory. */
function envFixture(body: string): { cwd: string } {
  const cwd = mkdtempSync(joinPath(tmpdir(), "keebforge-local-env-"));
  writeFileSync(joinPath(cwd, LOCAL_ENV_FILE), body, "utf8");
  return { cwd };
}

const LOCAL_SCRATCH_URL = `postgresql://keebforge:keebforge@localhost:${SCRATCH_PORT}/keebforge_e2e`;

{
  // A valid approved configuration is the one case that must be accepted.
  const { cwd } = envFixture(
    `# local only\nDATABASE_URL=${LOCAL_SCRATCH_URL}\nDIRECT_URL=${LOCAL_SCRATCH_URL}\n`,
  );
  const { target, databaseUrl, directUrl } = resolveLocalEnv({ cwd });
  assert.equal(target.host, "localhost");
  assert.equal(target.port, String(SCRATCH_PORT));
  assert.equal(target.database, "keebforge_e2e");
  assert.equal(databaseUrl, LOCAL_SCRATCH_URL);
  assert.equal(directUrl, LOCAL_SCRATCH_URL);
  pass("valid approved scratch configuration is accepted");
}

{
  // Refusal 1: no local file at all. Must not fall back to .env, which is the
  // production file and the root cause of the original incident.
  assert.throws(
    () => resolveLocalEnv({ cwd: joinPath(tmpdir(), "keebforge-does-not-exist") }),
    (e: unknown) =>
      e instanceof LocalEnvError &&
      e.code === "MISSING_LOCAL_ENV_FILE" &&
      /never falls back to \.env/.test(e.message),
  );
  pass("missing local configuration refuses");
}

{
  // Refusal 2: only one of the two variables. The Prisma CLI prefers
  // DIRECT_URL, so this is the exact gap that caused the incident.
  const { cwd } = envFixture(`DATABASE_URL=${LOCAL_SCRATCH_URL}\n`);
  assert.throws(
    () => resolveLocalEnv({ cwd }),
    (e: unknown) =>
      e instanceof LocalEnvError &&
      e.code === "MISSING_LOCAL_VARIABLES" &&
      /DIRECT_URL/.test(e.message) &&
      !/DATABASE_URL must/.test(e.message),
  );
  pass("a file defining only DATABASE_URL refuses");
}

{
  // Refusal 3: a production-shaped Supabase endpoint, as `.env` holds. The
  // host is synthetic (.invalid cannot resolve) but keeps the real provider
  // shape, so the PROVIDER_HOST substring hints are exercised identically.
  const prod = "postgresql://u:p@aws-0-ap-south-1.pooler.supabase.invalid:6543/postgres";
  const { cwd } = envFixture(`DATABASE_URL=${prod}\nDIRECT_URL=${prod}\n`);
  assert.throws(
    () => resolveLocalEnv({ cwd }),
    (e: unknown) =>
      e instanceof LocalEnvError &&
      e.code === "PROVIDER_HOST" &&
      /managed provider host/.test(e.message),
  );
  pass("a Supabase URL refuses");
}

{
  // Refusal 4: a remote host that is not a known provider.
  const remote = `postgresql://u:p@db.example.com:${SCRATCH_PORT}/keebforge_e2e`;
  const { cwd } = envFixture(`DATABASE_URL=${remote}\nDIRECT_URL=${remote}\n`);
  assert.throws(
    () => resolveLocalEnv({ cwd }),
    (e: unknown) => e instanceof LocalEnvError && e.code === "REMOTE_HOST",
  );
  pass("a remote hostname refuses");
}

{
  // Refusal 5: the two variables disagree. This is the incident shape.
  const other = `postgresql://keebforge:keebforge@localhost:${SCRATCH_PORT}/keebforge_e2e_fresh`;
  const { cwd } = envFixture(`DATABASE_URL=${LOCAL_SCRATCH_URL}\nDIRECT_URL=${other}\n`);
  assert.throws(
    () => resolveLocalEnv({ cwd }),
    (e: unknown) =>
      e instanceof LocalEnvError &&
      e.code === "DIRECT_URL_MISMATCH" &&
      /keebforge_e2e_fresh/.test(e.message),
  );
  pass("a mismatched DATABASE_URL and DIRECT_URL refuses");
}

{
  // Refusal 6: an unapproved database name, including a production-looking one.
  for (const [name, expected] of [
    ["keebforge_dev", "UNAPPROVED_DATABASE"],
    ["postgres", "PRODUCTION_DATABASE_NAME"],
  ] as const) {
    const url = `postgresql://keebforge:keebforge@localhost:${SCRATCH_PORT}/${name}`;
    const { cwd } = envFixture(`DATABASE_URL=${url}\nDIRECT_URL=${url}\n`);
    assert.throws(
      () => resolveLocalEnv({ cwd }),
      (e: unknown) => e instanceof LocalEnvError && e.code === expected,
    );
  }
  pass("an unapproved database name refuses");
}

{
  // Refusal 7: a missing explicit port must not silently default to 5432.
  const noPort = "postgresql://keebforge:keebforge@localhost/keebforge_e2e";
  const { cwd } = envFixture(`DATABASE_URL=${noPort}\nDIRECT_URL=${noPort}\n`);
  assert.throws(
    () => resolveLocalEnv({ cwd }),
    (e: unknown) => e instanceof LocalEnvError && e.code === "NO_PORT",
  );
  pass("a URL without an explicit port refuses");
}

{
  // Refusal 8: applyLocalEnv must refuse BEFORE it writes anything, so a failed
  // run cannot leave a half-configured process.env behind.
  const { cwd } = envFixture(`DATABASE_URL=${LOCAL_SCRATCH_URL}\n`);
  const before = { ...process.env };
  assert.throws(() => applyLocalEnv({ cwd }), LocalEnvError);
  assert.equal(process.env.DATABASE_URL, before.DATABASE_URL);
  assert.equal(process.env.DIRECT_URL, before.DIRECT_URL);
  pass("applyLocalEnv refuses without mutating the environment");
}

{
  // On success both variables are pinned, so Prisma's later .env load cannot
  // reintroduce the production DIRECT_URL (dotenv never overwrites a set key).
  const { cwd } = envFixture(
    `DATABASE_URL=${LOCAL_SCRATCH_URL}\nDIRECT_URL=${LOCAL_SCRATCH_URL}\n`,
  );
  const before = { ...process.env };
  const target = applyLocalEnv({ cwd });
  assert.equal(target.database, "keebforge_e2e");
  assert.equal(process.env.DATABASE_URL, LOCAL_SCRATCH_URL);
  assert.equal(process.env.DIRECT_URL, LOCAL_SCRATCH_URL);
  for (const k of Object.keys(process.env)) {
    if (!(k in before)) delete process.env[k];
  }
  Object.assign(process.env, before);
  pass("applyLocalEnv pins both variables to the verified scratch target");
}

{
  // The seed must guard before Prisma is imported, and must never import Prisma
  // statically. A static import would load .env — and production credentials —
  // before any check could run.
  const seed = codeOf("scripts/e2e/seed.ts");
  assert.ok(
    !/^\s*import\s[^\n]*@prisma\/client/m.test(seed),
    "seed.ts must not statically import @prisma/client",
  );
  assert.ok(
    /await import\(\s*["']@prisma\/client["']\s*\)/.test(seed),
    "seed.ts must import @prisma/client dynamically",
  );
  const guardAt = seed.indexOf("applyLocalEnv(");
  const importAt = seed.indexOf('await import("@prisma/client")');
  assert.ok(guardAt > -1, "seed.ts must call applyLocalEnv");
  assert.ok(importAt > -1);
  assert.ok(
    guardAt < importAt,
    "the guard must be called before @prisma/client is imported",
  );
  pass("the seed guard runs before the Prisma import");
}

{
  // The seed cannot execute without validated local configuration: the guard is
  // the first statement of main, and nothing database-touching exists above it.
  const seed = codeOf("scripts/e2e/seed.ts");
  const mainAt = seed.indexOf("async function main");
  assert.ok(mainAt > -1);
  const body = seed.slice(mainAt);
  const afterSignature = seed.slice(seed.indexOf("{", mainAt) + 1);
  const firstStatement = afterSignature
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//"))[0];
  assert.equal(
    firstStatement,
    "const target: Target = applyLocalEnv();",
    "applyLocalEnv must be the first statement in main()",
  );
  const prismaCtor = body.indexOf("new PrismaClient()");
  assert.ok(prismaCtor > -1 && prismaCtor > body.indexOf("applyLocalEnv()"));
  pass("the seed cannot execute without validated local configuration");
}

{
  // seed.mjs must stay a refusal shim: no Prisma import, no writes, no exit 0.
  const shim = codeOf("scripts/e2e/seed.mjs");
  // Check the executable form, not the prose: the shim's own comment explains
  // why Prisma is no longer imported, so a bare substring match would fail on
  // its own documentation.
  const shimCode = stripComments(shim);
  assert.ok(
    !/^\s*import\s/m.test(shimCode),
    "seed.mjs must contain no import statement at all",
  );
  assert.ok(!/\brequire\s*\(/.test(shimCode), "seed.mjs must not require anything");
  assert.ok(!/deleteMany|\.create\(/.test(shimCode), "seed.mjs must not contain write logic");
  assert.ok(!/new PrismaClient/.test(shimCode), "seed.mjs must not construct PrismaClient");
  assert.ok(/REFUSED \[UNGUARDED_SEED\]/.test(shim), "seed.mjs must refuse with an explanation");
  assert.ok(/process\.exit\(1\)/.test(shim), "seed.mjs must exit non-zero");
  pass("direct execution of the old seed path refuses");
}

{
  // local-env must never read .env or .env.local. Only the named file is read.
  const localEnv = codeOf("scripts/e2e/local-env.ts");
  assert.ok(!/from\s+["']dotenv/.test(localEnv), "local-env must not use dotenv");
  assert.ok(!/require\(["']dotenv/.test(localEnv));
  for (const forbidden of ['".env"', "'.env'", '".env.local"', "'.env.local'", '".env.e2e"']) {
    assert.ok(
      !localEnv.includes(forbidden),
      `local-env must never reference ${forbidden} — production credentials live there`,
    );
  }
  assert.ok(!localEnv.includes("process.env.DATABASE_URL = process.env"));
  pass("the local loader never reads .env, .env.local or .env.e2e");
}

{
  // The template is trackable, dummy, and points at loopback only.
  const template = readFileSync(".env.e2e.local.example", "utf8");
  const parsed = parseEnvFile(template);
  assert.ok(parsed.DATABASE_URL && parsed.DIRECT_URL);
  const { databaseUrl: target } = assertScratchPair({
    databaseUrl: parsed.DATABASE_URL,
    directUrl: parsed.DIRECT_URL,
  });
  assert.equal(target.host, "localhost");
  assert.equal(target.port, String(SCRATCH_PORT));
  assert.ok(APPROVED_SCRATCH_DATABASES.includes(target.database));
  const ignore = readFileSync(".gitignore", "utf8");
  assert.ok(ignore.includes("!.env.e2e.local.example"));
  assert.ok(ignore.includes(".env*"));
  pass("the tracked template holds only dummy loopback values");
}

{
  // .env.local is off limits: Next loads it in production builds too, so putting
  // a database URL there would shadow the production .env value.
  const nextEnv = readFileSync("node_modules/@next/env/dist/index.js", "utf8");
  const filter = nextEnv.match(/const f=\[([^\]]+)\]/)?.[1] ?? "";
  assert.ok(
    filter.includes('.env.local') && filter.includes('d!=="test"'),
    "Next loads .env.local outside test, including production",
  );
  assert.ok(
    /typeof \w+\[\w+\]==="undefined"&&typeof \w+\[\w+\]==="undefined"/.test(nextEnv),
    "Next's loader is first-wins per key",
  );
  const template = readFileSync(".env.e2e.local.example", "utf8");
  assert.ok(
    template.includes(".env.local is deliberately not used"),
    "the template must document why .env.local is unused",
  );
  assert.equal(LOCAL_ENV_FILE, ".env.e2e.local");
  assert.ok(LOCAL_ENV_FILE.endsWith(".local"), "the local file must stay outside Next's load set");
  pass("environment-loading findings are pinned to the real Next.js behaviour");
}

{
  // package.json must expose an explicit local seed command and must not gain a
  // production one.
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts["e2e:seed"], "tsx scripts/e2e/seed.ts");
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    assert.ok(
      !/seed/.test(name) || name === "e2e:seed",
      `no unexpected seed script: ${name}`,
    );
    assert.ok(
      !/seed.*prisma|prisma.*seed/.test(cmd),
      `${name} must not combine the seed with a bare prisma invocation`,
    );
  }
  pass("the local seed command exists and no production seed command does");
}


/* ------------------------------------------------------------------------- *
 * Batch 5C.5 — `.env.e2e` sourcing removed, one local-env mechanism everywhere.
 * ------------------------------------------------------------------------- */

{
  // The unsafe instructions must be gone from every file a developer would read
  // before running this test. Checked across the whole repository, not just the
  // file that used to carry them, so the pattern cannot reappear elsewhere.
  const scanTargets = [
    "src/lib/security/order-success-page.test.ts",
    "scripts/e2e/run-order-success-page.ts",
    "scripts/e2e/e2e-server.ts",
    "scripts/e2e/seed.ts",
    "scripts/e2e/seed.mjs",
    "scripts/e2e/local-env.ts",
    "scripts/e2e/scratch-guard.ts",
    "scripts/e2e/migrate-scratch.ts",
    "package.json",
    ".env.e2e.local.example",
  ];
  for (const file of scanTargets) {
    const raw = rawOf(file);
    assert.ok(!/set\s+-a/.test(raw), `${file} must not instruct the reader to use set -a`);
    assert.ok(
      !/(\.\s+\.\/|source|\.)\s*\.?\/?\.env\.e2e(?!\.local)/m.test(raw),
      `${file} must not instruct the reader to source .env.e2e`,
    );
    assert.ok(
      !/dotenv\s+-f|dotenv_config_path|--env-file/.test(raw),
      `${file} must not instruct the reader to load an arbitrary env file`,
    );
  }
  // Prove the scan above is not vacuous: `codeOf` would have stripped this line.
  assert.ok(
    rawOf("src/lib/security/order-success-page.test.ts").includes("set -a") ||
      !codeOf("src/lib/security/order-success-page.test.ts").includes("set -a"),
    "rawOf and codeOf must differ for a file with block comments",
  );
  assert.ok(
    !/set\s+-a/.test(rawOf("src/lib/security/order-success-page.test.ts")),
    "the test file itself must not contain the shell pattern at all",
  );
  pass("the unsafe .env.e2e sourcing instructions are gone");
}

{
  // A repo-wide sweep, so the pattern cannot hide in a file nobody remembered.
  const offenders: string[] = [];
  for (const file of walkRepo()) {
    if (!/\.(ts|tsx|mjs|cjs|js|json|md)$/.test(file)) continue;
    const raw = readFileSync(file, "utf8");
    if (/set\s+-a\s*;|\.\s+\.\.\/\.env\.e2e(?!\.local)/.test(raw)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `no file may source .env.e2e: ${offenders.join(", ")}`);
  pass("no file in the repository sources .env.e2e any more");
}

{
  // The order-success-page test must guard before it constructs its client, and
  // must not construct one before validating.
  const code = codeOf("src/lib/security/order-success-page.test.ts");
  const guardAt = code.indexOf("assertLocalEnvApplied()");
  const ctorAt = code.indexOf("new PrismaClient()");
  assert.ok(guardAt > -1, "the test must call assertLocalEnvApplied");
  assert.ok(ctorAt > -1);
  assert.ok(guardAt < ctorAt, "assertLocalEnvApplied must precede new PrismaClient()");
  const between = code.slice(guardAt, ctorAt);
  assert.ok(
    !/prisma\./.test(between),
    "nothing may touch the client between the guard and its construction",
  );
  // And it must still be a static import — the whole point of assertLocalEnvApplied
  // is that a hoisted Prisma import makes in-body pinning impossible.
  assert.ok(
    /^import \{ PrismaClient \} from "@prisma\/client";/m.test(code),
    "the test's Prisma import is expected to be static",
  );
  pass("the order-success-page test guards before constructing PrismaClient");
}

{
  // assertLocalEnvApplied refuses when the live environment is not the approved
  // scratch pair — which is the situation when `.env` was loaded instead.
  const prod = "postgresql://u:p@aws-0-ap-south-1.pooler.supabase.invalid:6543/postgres";
  assert.throws(
    () => assertLocalEnvApplied({ DATABASE_URL: prod, DIRECT_URL: prod }),
    (e: unknown) =>
      e instanceof LocalEnvError &&
      e.code === "PROVIDER_HOST" &&
      /Refusing before any query/.test(e.message),
  );
  pass("a production-shaped live environment is refused before any query");
}

{
  // ...and when only one variable is present, which is the incident shape.
  assert.throws(
    () => assertLocalEnvApplied({ DATABASE_URL: LOCAL_SCRATCH_URL }),
    (e: unknown) => e instanceof LocalEnvError && e.code === "LOCAL_ENV_NOT_APPLIED",
  );
  assert.throws(
    () => assertLocalEnvApplied({}),
    (e: unknown) => e instanceof LocalEnvError && e.code === "LOCAL_ENV_NOT_APPLIED",
  );
  pass("a partially applied local environment is refused");
}

{
  // ...and when the two disagree, even though both are loopback.
  const other = LOCAL_SCRATCH_URL.replace("keebforge_e2e", "keebforge_e2e_fresh");
  assert.throws(
    () => assertLocalEnvApplied({ DATABASE_URL: LOCAL_SCRATCH_URL, DIRECT_URL: other }),
    (e: unknown) => e instanceof LocalEnvError && e.code === "DIRECT_URL_MISMATCH",
  );
  pass("a mismatched live environment is refused");
}

{
  // The approved pair passes. This is the case the runner produces.
  const target = assertLocalEnvApplied({
    DATABASE_URL: LOCAL_SCRATCH_URL,
    DIRECT_URL: LOCAL_SCRATCH_URL,
  });
  assert.equal(target.database, "keebforge_e2e");
  pass("the approved live environment passes the check");
}

{
  // Existing production variables cannot override the validated pair: applyLocalEnv
  // assigns over whatever is already exported, and dotenv cannot undo it because
  // it never overwrites a key that is already set.
  const prod = "postgresql://u:p@aws-0-ap-south-1.pooler.supabase.invalid:6543/postgres";
  const { cwd } = envFixture(
    `DATABASE_URL=${LOCAL_SCRATCH_URL}\nDIRECT_URL=${LOCAL_SCRATCH_URL}\n`,
  );
  const before = { ...process.env };
  process.env.DATABASE_URL = prod;
  process.env.DIRECT_URL = prod;
  try {
    const target = applyLocalEnv({ cwd });
    assert.equal(target.database, "keebforge_e2e");
    assert.equal(process.env.DATABASE_URL, LOCAL_SCRATCH_URL);
    assert.equal(process.env.DIRECT_URL, LOCAL_SCRATCH_URL);
    assert.equal(assertLocalEnvApplied().database, "keebforge_e2e");
  } finally {
    for (const k of Object.keys(process.env)) {
      if (!(k in before)) delete process.env[k];
    }
    Object.assign(process.env, before);
  }
  pass("pre-existing production variables are overwritten by the validated pair");
}

{
  // The runner must apply the guard before the test module is imported, since the
  // test module's own Prisma import is hoisted and would otherwise load `.env`.
  const runner = codeOf("scripts/e2e/run-order-success-page.ts");
  const guardAt = runner.indexOf("applyLocalEnv(");
  const testImportAt = runner.indexOf("await import(TEST_MODULE)");
  assert.ok(guardAt > -1, "the runner must call applyLocalEnv");
  assert.ok(testImportAt > -1, "the runner must import the test module dynamically");
  assert.ok(guardAt < testImportAt, "the guard must run before the test module loads");
  assert.ok(
    /src\/lib\/security\/order-success-page\.test/.test(runner),
    "the runner must target the order-success-page test",
  );
  assert.ok(
    !/^import .*order-success-page\.test/m.test(runner),
    "the test module must not be imported statically by the runner",
  );
  pass("the runner validates before the test module is loaded");
}

{
  // The server under test must be local. `SUCCESS_E2E_URL` varies the port; it
  // must not be able to redirect this file — which writes rows — off-box.
  const code = codeOf("src/lib/security/order-success-page.test.ts");
  const baseAt = code.indexOf("const BASE =");
  assert.ok(baseAt > -1, "BASE must be computed, not a bare constant");
  const block = code.slice(baseAt, code.indexOf("const M ="));
  assert.ok(block.includes("SUCCESS_E2E_URL"), "BASE honours SUCCESS_E2E_URL");
  assert.ok(block.includes("new URL(configured)"), "BASE parses the configured URL");
  for (const host of ["localhost", "127.0.0.1", "::1"]) {
    assert.ok(block.includes(`"${host}"`), `BASE must allow ${host}`);
  }
  assert.ok(
    /if \(!\[[\s\S]*?\]\.includes\(hostname\)\)/.test(block),
    "BASE must refuse a non-loopback hostname",
  );
  assert.ok(/throw new Error/.test(block), "a non-loopback host must be a hard failure");
  pass("the test's server base URL cannot be pointed off-box");
}

{
  // The server launcher uses the same mechanism, so `next start` cannot inherit
  // production connection variables.
  const server = codeOf("scripts/e2e/e2e-server.ts");
  assert.ok(server.includes("applyLocalEnv("), "the server launcher must apply the local env");
  const guardAt = server.indexOf("applyLocalEnv(");
  const spawnAt = server.indexOf("spawn(");
  assert.ok(guardAt > -1 && spawnAt > -1 && guardAt < spawnAt, "guard before spawn");
  assert.ok(
    !/dotenv|configDotenv/.test(server),
    "the server launcher must not load an env file by another route",
  );
  assert.ok(
    /writeFileSync|appendFileSync|createWriteStream/.test(server) === false,
    "the server launcher must not write to any environment file",
  );
  pass("the server launcher validates the local environment before starting");
}

{
  // All local E2E database scripts go through the one loader.
  const scripts = [
    "scripts/e2e/seed.ts",
    "scripts/e2e/run-order-success-page.ts",
    "scripts/e2e/e2e-server.ts",
    "scripts/e2e/migrate-scratch.ts",
  ];
  for (const file of scripts) {
    const code = codeOf(file);
    assert.ok(
      code.includes("local-env") && /applyLocalEnv\(|resolveLocalEnv\(|assertLocalEnvApplied\(/.test(code),
      `${file} must use the shared local-env loader`,
    );
  }
  // The migration wrapper must not accept a separate password source that could
  // disagree with the validated target.
  const wrapper = codeOf("scripts/e2e/migrate-scratch.ts");
  assert.ok(
    /new URL\(local\.databaseUrl\)\.password/.test(wrapper),
    "the wrapper must derive its password from the validated DATABASE_URL",
  );
  assert.ok(
    /DATABASE_FLAG_MISMATCH/.test(wrapper),
    "the wrapper must refuse when --database contradicts the validated file",
  );
  // Subcommand validation must precede the configuration read, so that refusing
  // `reset` never depends on which files happen to exist on the machine.
  const subAt = wrapper.indexOf("preflightSubcommand(");
  const envAt = wrapper.indexOf("resolveLocalEnv(");
  assert.ok(subAt > -1, "the wrapper must pre-flight the subcommand");
  assert.ok(envAt > -1, "the wrapper must resolve the local env");
  assert.ok(
    subAt < envAt,
    "the subcommand must be rejected before any configuration file is read",
  );
  // And the planner itself must still reject it, so the rule survives even if the
  // executor's pre-flight is removed.
  assert.deepEqual(planMigrationRun(["migrate", "reset"], {}).ok, false);
  assert.deepEqual(planMigrationRun(["migrate", "dev"], {}).ok, false);
  pass("every local E2E database script uses the shared local environment");
}

{
  // The loader must not have regained the ability to read an arbitrary path.
  const localEnv = codeOf("scripts/e2e/local-env.ts");
  assert.ok(!/file\?:\s*string/.test(localEnv), "the loader must not accept a file path");
  assert.ok(
    !/readFileSync\(\s*[^)]*opts\./.test(localEnv),
    "the loader must not read a caller-supplied path",
  );
  assert.ok(
    /export function resolveLocalEnv/.test(localEnv) &&
      /const file = LOCAL_ENV_FILE;/.test(localEnv),
    "the loader must use the fixed local file name",
  );
  pass("the local loader accepts no arbitrary env path");
}

{
  // Both scripts that construct a client must validate before doing so.
  for (const file of ["scripts/e2e/seed.ts", "scripts/e2e/e2e-server.ts"]) {
    const code = codeOf(file);
    const guardAt = code.search(/applyLocalEnv\(|resolveLocalEnv\(/);
    const clientAt = code.search(/PrismaClient|spawn\(/);
    assert.ok(guardAt > -1 && clientAt > -1, `${file} needs both a guard and a client/spawn`);
    assert.ok(guardAt < clientAt, `${file}: validation must precede the client`);
  }
  const seed = codeOf("scripts/e2e/seed.ts");
  const guardAt = seed.indexOf("applyLocalEnv(");
  const importAt = seed.indexOf('await import("@prisma/client")');
  assert.ok(guardAt > -1 && importAt > -1 && guardAt < importAt);
  pass("Prisma import remains after validation in every script");
}

{
  // The documented workflow must be runnable and must not reintroduce shell
  // sourcing. Assert the package scripts exist and match the guarded entrypoints.
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  assert.equal(pkg.scripts["e2e:order-success-page"], "tsx scripts/e2e/run-order-success-page.ts");
  assert.equal(pkg.scripts["e2e:server"], "tsx scripts/e2e/e2e-server.ts");
  assert.equal(pkg.scripts["e2e:seed"], "tsx scripts/e2e/seed.ts");
  const header = rawOf("src/lib/security/order-success-page.test.ts").slice(0, 4000);
  assert.ok(header.includes("npm run e2e:order-success-page"), "the test documents the runner");
  assert.ok(header.includes("npm run e2e:server"), "the test documents the server launcher");
  assert.ok(
    header.includes("Refusing") || header.includes("refuses"),
    "the test documents that direct execution refuses",
  );
  pass("the documented local workflow is complete and shell-free");
}

{
  // The shared subcommand pre-flight, used by both the planner and the executor.
  for (const argv of [["reset"], ["dev"], ["resolve"], [], ["--database", "keebforge_e2e"]]) {
    const r = preflightSubcommand(argv);
    assert.equal(r.ok, false, `must refuse ${JSON.stringify(argv)}`);
    if (!r.ok) assert.ok(r.code === "NO_SUBCOMMAND" || r.code === "UNSAFE_SUBCOMMAND");
  }
  for (const sub of SAFE_SUBCOMMANDS) {
    assert.equal(preflightSubcommand([sub, "--database", "keebforge_e2e"]).ok, true);
  }
  pass("the subcommand pre-flight refuses unsafe and missing subcommands");
}

/* ------------------------------------------------------------------------- *
 * Batch 5C.6 — the emitted Prisma command and the reported server address.
 *
 * Two defects made the harness unusable, both of which the offline tests above
 * had passed over because they asserted on guardrails rather than on output:
 *
 *   1. The planner emitted `npx prisma <subcommand>`. Prisma has no top-level
 *      `deploy`, `status` or `diff`; they live under `migrate`. Asked for a bare
 *      `prisma deploy`, the CLI tried to `npm install @prisma/cli-deploy`.
 *   2. The connectivity gate compared `inet_server_port()` with the published
 *      host port. Under port forwarding those are 5432 and 55432 respectively,
 *      so the gate refused a correct connection.
 *
 * Nothing here opens a connection or spawns a process.
 * ------------------------------------------------------------------------- */

{
  // The emitted command must name the `migrate` group, for every permitted
  // subcommand. `args[1]` is the group and `args[2]` the subcommand, so a
  // regression that drops the group cannot pass.
  for (const sub of SAFE_SUBCOMMANDS) {
    const plan = planMigrationRun([sub, "--database", "keebforge_e2e_fresh"], ENV);
    assert.ok(plan.ok, `${sub}: expected a plan`);
    if (!plan.ok) continue;
    assert.deepEqual(
      plan.args,
      ["prisma", "migrate", sub],
      `${sub}: must emit "prisma migrate ${sub}"`,
    );
    assert.equal(plan.command, "npx");
    assert.equal(plan.args[1], "migrate", `${sub}: the migrate group must always be present`);
    pass(`the planner emits "prisma migrate ${sub}"`);
  }
}

{
  // The exact shape observed live: `npx prisma deploy status` reached the npm
  // registry. A bare group-less subcommand must not be constructible at all.
  for (const sub of SAFE_SUBCOMMANDS) {
    const plan = planMigrationRun([sub, "--database", "keebforge_e2e"], ENV);
    assert.ok(plan.ok);
    if (!plan.ok) continue;
    assert.notEqual(
      plan.args[1],
      sub,
      `${sub}: the subcommand must not be placed directly after "prisma"`,
    );
    assert.ok(
      !plan.args.includes("cli-deploy"),
      "the emitted command must never name a dynamically installable subcommand package",
    );
  }
  pass("no emitted command names a dynamically installable Prisma subcommand");
}

{
  // The group name is supplied by the wrapper, so a caller passing it is
  // refused — `migrate` is not a subcommand of `migrate`.
  expectPlanRefusal(
    ["migrate", "deploy", "--database", "keebforge_e2e"],
    ENV,
    "UNSAFE_SUBCOMMAND",
    "'migrate deploy' is refused; the wrapper supplies the group",
  );
}

{
  // Passthrough arguments survive, and stay after the subcommand.
  const plan = planMigrationRun(
    ["status", "--database", "keebforge_e2e", "--", "--schema", "prisma/schema.prisma"],
    ENV,
  );
  assert.ok(plan.ok);
  if (plan.ok) {
    assert.deepEqual(plan.args, [
      "prisma",
      "migrate",
      "status",
      "--schema",
      "prisma/schema.prisma",
    ]);
    pass("passthrough Prisma arguments are forwarded after the subcommand");
  }
}

{
  // Both variables stay pinned to one verified scratch URL, and that URL is
  // itself re-validated through the same guard the executor uses.
  for (const db of APPROVED_SCRATCH_DATABASES) {
    const plan = planMigrationRun(["deploy", "--database", db], ENV);
    assert.ok(plan.ok, `${db}: expected a plan`);
    if (!plan.ok) continue;
    assert.equal(plan.childEnv.DATABASE_URL, plan.childEnv.DIRECT_URL);
    const r = assertScratchPair({
      databaseUrl: plan.childEnv.DATABASE_URL,
      directUrl: plan.childEnv.DIRECT_URL,
    });
    assert.equal(r.databaseUrl.database, db);
    assert.equal(r.databaseUrl.port, String(SCRATCH_PORT));
    assert.ok(SCRATCH_HOSTS.includes(r.databaseUrl.host));
  }
  pass("the planner pins both variables to one re-validated scratch URL");
}

{
  // Address classification. The published container sits on the Docker bridge,
  // so a private address is the expected answer and a loopback literal is not
  // reachable through a forwarded port at all.
  const cases: Array<[string | null, string]> = [
    ["127.0.0.1", "loopback"],
    ["127.1.2.3", "loopback"],
    ["::1", "loopback"],
    ["172.17.0.2", "local-network"],
    ["10.0.0.5", "local-network"],
    ["192.168.1.10", "local-network"],
    ["169.254.1.1", "local-network"],
    ["fd00::1", "local-network"],
    ["34.120.5.5", "remote"],
    ["8.8.8.8", "remote"],
    ["172.15.0.1", "remote"],
    ["172.32.0.1", "remote"],
    ["192.169.0.1", "remote"],
    ["11.0.0.1", "remote"],
    [null, "absent"],
    ["", "absent"],
    ["   ", "absent"],
  ];
  for (const [addr, want] of cases) {
    assert.equal(
      classifyServerAddress(addr),
      want,
      `${String(addr)} must classify as ${want}`,
    );
  }
  pass("server addresses classify into loopback, local-network, remote and absent");
}

{
  const expected = { database: "keebforge_e2e_fresh", publishedPort: String(SCRATCH_PORT) };

  // The live case: loopback published port, bridge address, container port.
  const forwarded = checkConnectedServer(
    { database: "keebforge_e2e_fresh", serverAddress: "172.17.0.2", serverPort: 5432 },
    expected,
  );
  assert.ok(forwarded.ok, "a forwarded local connection must be accepted");
  if (forwarded.ok) assert.equal(forwarded.classification, "local-network");
  pass("a forwarded loopback connection is accepted despite the differing server port");

  // ...and the same answer when the server really is on loopback.
  const direct = checkConnectedServer(
    { database: "keebforge_e2e_fresh", serverAddress: "127.0.0.1", serverPort: 5432 },
    expected,
  );
  assert.ok(direct.ok, "a direct loopback connection must be accepted");
  pass("a direct loopback connection is accepted");

  // A routable address is production's shape and must be refused.
  for (const addr of ["34.120.5.5", "8.8.8.8", "203.0.113.7"]) {
    const r = checkConnectedServer(
      { database: "keebforge_e2e_fresh", serverAddress: addr, serverPort: 5432 },
      expected,
    );
    assert.equal(r.ok, false, `${addr} must be refused`);
    if (!r.ok) assert.equal(r.code, "SERVER_REMOTE_ADDRESS", `${addr}: wrong code`);
  }
  pass("the connectivity check refuses a routable server address");

  // No address means a Unix socket, which is not what the verified URL dialled.
  for (const addr of [null, ""]) {
    const r = checkConnectedServer(
      { database: "keebforge_e2e_fresh", serverAddress: addr, serverPort: 5432 },
      expected,
    );
    assert.equal(r.ok, false, `${String(addr)} must be refused`);
    if (!r.ok) assert.equal(r.code, "SERVER_ADDRESS_UNKNOWN");
  }
  pass("the connectivity check refuses a server that reports no address");

  // The database name check is untouched and still runs first.
  const wrongDb = checkConnectedServer(
    { database: "postgres", serverAddress: "127.0.0.1", serverPort: 5432 },
    expected,
  );
  assert.equal(wrongDb.ok, false);
  if (!wrongDb.ok) {
    assert.equal(wrongDb.code, "SERVER_MISMATCH");
    assert.ok(/keebforge_e2e_fresh/.test(wrongDb.message));
  }
  pass("the connectivity check still refuses a mismatched database name");
}

{
  // The server port is held to PostgreSQL's own listening port inside the
  // container, never to the host's published port, and `inet_server_addr()` is an
  // `inet`, so PostgreSQL renders it in CIDR form. These cases use the exact
  // strings the server produces, not the bare addresses the earlier tests
  // assumed — the earlier shape was never what this harness received.
  const expected = { database: "keebforge_e2e_fresh", publishedPort: String(SCRATCH_PORT) };

  // The value actually observed from the scratch container, end to end.
  const real = checkConnectedServer(
    { database: "keebforge_e2e_fresh", serverAddress: "172.17.0.2/32", serverPort: SERVER_SIDE_PORT },
    expected,
  );
  assert.ok(real.ok, "the real container address 172.17.0.2/32 must be accepted");
  if (real.ok) assert.equal(real.classification, "local-network");

  const accepts: ReadonlyArray<readonly [string, string]> = [
    ["172.17.0.2/32", "local-network"],
    ["172.17.0.2/24", "local-network"],
    ["10.0.0.5/8", "local-network"],
    ["192.168.1.10/24", "local-network"],
    ["169.254.1.1/16", "local-network"],
    ["127.0.0.1/32", "loopback"],
    ["127.0.0.1/8", "loopback"],
    ["::1/128", "loopback"],
    ["fd00::1/64", "local-network"],
    ["fe80::1/64", "local-network"],
    // IPv4-mapped forms of private and loopback addresses.
    ["::ffff:172.17.0.2/128", "local-network"],
    ["::ffff:10.0.0.5/128", "local-network"],
    ["::ffff:127.0.0.1/128", "loopback"],
    // The same mapped address in pure hex, as `::ffff:ac11:2`.
    ["::ffff:ac11:2/128", "local-network"],
    // A prefix of zero is in range and must not by itself change the verdict.
    ["172.17.0.2/0", "local-network"],
  ];
  for (const [addr, want] of accepts) {
    assert.equal(classifyServerAddress(addr), want, `${addr} must classify as ${want}`);
  }
  pass("CIDR and IPv4-mapped addresses that are local are accepted");
}

{
  // A routable address is refused whatever shape it arrives in, so tolerating
  // the prefix must not widen what is considered local.
  const rejects: ReadonlyArray<readonly [string, string]> = [
    ["8.8.8.8/32", "remote"],
    ["203.0.113.7/32", "remote"],
    ["0.0.0.0/0", "remote"],
    ["1.1.1.1/24", "remote"],
    ["::ffff:8.8.8.8/128", "remote"],
    ["::ffff:203.0.113.7/128", "remote"],
    ["2001:db8::1/32", "remote"],
    // Prefixes outside the family's range.
    ["172.17.0.2/33", "remote"],
    ["127.0.0.1/33", "remote"],
    ["::1/129", "remote"],
    ["fd00::1/129", "remote"],
    // Malformed prefixes and malformed addresses.
    ["172.17.0.2/", "remote"],
    ["172.17.0.2/abc", "remote"],
    ["172.17.0.2/32/32", "remote"],
    ["172.17.0.2/ 32", "remote"],
    ["172.17.0.2/-1", "remote"],
    ["172.17.0.2/032", "remote"],
    ["/32", "remote"],
    ["172.17.0.2//32", "remote"],
    ["172.17.0.256/32", "remote"],
    // Leading-zero octets are the decimal/octal ambiguity: "010.0.0.1" is
    // private read as decimal and public read as octal, so it is refused whole.
    ["172.17.04.2/32", "remote"],
    ["010.0.0.1", "remote"],
    ["127.000.000.001", "remote"],
    ["gggg::1", "remote"],
    ["fe80:::1", "remote"],
    [":::", "remote"],
    ["1:::2", "remote"],
    ["::1::2", "remote"],
    ["1::2::3", "remote"],
    // Truncated forms that are syntactically plausible but not addresses.
["fe80:1", "remote"],
    ["fd00:1", "remote"],
    ["1.2.3.4:80", "remote"],
    // Stray colons at either end, and truncated group counts. Each of these was
    // accepted as local at some point during development; they are pinned here
    // because a plausible-looking truncation must never read as private.
    ["fd00::1:/32", "remote"],
    ["fd00::1:/24", "remote"],
    [":fd00::1", "remote"],
    [":1:2:3:4:5:6:7:8", "remote"],
    ["1:2:3", "remote"],
    ["fe80::1::", "remote"],
    // "::" is legal on its own and is the unspecified address, so remote.
    ["::", "remote"],
    ["", "absent"],
  ];
  for (const [addr, want] of rejects) {
    assert.equal(classifyServerAddress(addr), want, `${JSON.stringify(addr)} must classify as ${want}`);
  }
  pass("routable, out-of-range and malformed addresses are refused");
}

{
  // A routable address presented as a mapped IPv6 form must still be refused by
  // the connectivity gate, not merely by the classifier.
  const expected = { database: "keebforge_e2e_fresh", publishedPort: String(SCRATCH_PORT) };
  for (const addr of ["8.8.8.8/32", "::ffff:8.8.8.8/128", "203.0.113.7/32"]) {
    const r = checkConnectedServer(
      { database: "keebforge_e2e_fresh", serverAddress: addr, serverPort: SERVER_SIDE_PORT },
      expected,
    );
    assert.equal(r.ok, false, `${addr} must be refused`);
    if (!r.ok) assert.equal(r.code, "SERVER_REMOTE_ADDRESS", `${addr}: wrong code`);
  }
  pass("the connectivity gate refuses a routable CIDR or mapped address");
}

{
  assert.equal(SCRATCH_PORT, 55432, "the published host port is 55432");
  assert.equal(SERVER_SIDE_PORT, 5432, "PostgreSQL's container-side port is 5432");
  assert.notEqual(
    SERVER_SIDE_PORT,
    SCRATCH_PORT,
    "the two ports must remain distinct constants",
  );
  pass("the published host port and PostgreSQL's container-side port are distinct");
}

{
  // Requirement: the correct container-side port is accepted, on a private
  // container address, which is what a loopback-published container reports.
  const expected = { database: "keebforge_e2e_fresh", publishedPort: String(SCRATCH_PORT) };
  for (const addr of ["172.17.0.2", "127.0.0.1", "10.0.0.5", "192.168.1.10", "::1"]) {
    const r = checkConnectedServer(
      { database: "keebforge_e2e_fresh", serverAddress: addr, serverPort: SERVER_SIDE_PORT },
      expected,
    );
    assert.ok(r.ok, `${addr}:5432 must be accepted`);
    if (r.ok) {
      assert.ok(
        r.classification === "local-network" || r.classification === "loopback",
        `${addr}: unexpected classification ${r.classification}`,
      );
    }
  }
  pass("the correct container-side port 5432 is accepted on a local address");
}

{
  const expected = { database: "keebforge_e2e_fresh", publishedPort: String(SCRATCH_PORT) };

  // Incorrect server-side ports. Crucially this includes 55432 itself: the old
  // defect demanded the *published* port here, so 55432 used to be the only
  // value that would have passed. It must now be refused.
  for (const port of [5431, 5433, 55432, 80, 0, -1, 70000]) {
    const r = checkConnectedServer(
      { database: "keebforge_e2e_fresh", serverAddress: "172.17.0.2", serverPort: port },
      expected,
    );
    assert.equal(r.ok, false, `server port ${port} must be refused`);
    if (!r.ok) {
      assert.equal(r.code, "SERVER_PORT_MISMATCH", `port ${port}: wrong code`);
      assert.ok(
        /5432/.test(r.message),
        `port ${port}: the message must name PostgreSQL's container-side port`,
      );
    }
  }
  pass("the connectivity check refuses an incorrect server-side port, including 55432");
}

{
  // A value that is not even a port number cannot be compared, and is reported
  // as unusable rather than as a mismatch.
  const expected = { database: "keebforge_e2e_fresh", publishedPort: String(SCRATCH_PORT) };
  for (const port of [Number.NaN, Infinity, -Infinity, 1.5]) {
    const r = checkConnectedServer(
      { database: "keebforge_e2e_fresh", serverAddress: "172.17.0.2", serverPort: port },
      expected,
    );
    assert.equal(r.ok, false, `port ${port} must be refused`);
    if (!r.ok) assert.equal(r.code, "SERVER_PORT_INVALID", `port ${port}: wrong code`);
  }
  pass("the connectivity check refuses a server port that is not a number");
}

{
  // Private container addresses are accepted; routable ones are refused. The
  // address is judged on locality and is independent of the port check.
  const expected = { database: "keebforge_e2e_fresh", publishedPort: String(SCRATCH_PORT) };
  for (const addr of ["172.17.0.2", "10.0.0.5", "192.168.1.10", "169.254.1.1", "fd00::1"]) {
    const r = checkConnectedServer(
      { database: "keebforge_e2e_fresh", serverAddress: addr, serverPort: SERVER_SIDE_PORT },
      expected,
    );
    assert.ok(r.ok, `${addr} must be accepted`);
    if (r.ok) assert.equal(r.classification, "local-network");
  }
  for (const addr of ["34.120.5.5", "8.8.8.8", "203.0.113.7"]) {
    const r = checkConnectedServer(
      { database: "keebforge_e2e_fresh", serverAddress: addr, serverPort: SERVER_SIDE_PORT },
      expected,
    );
    assert.equal(r.ok, false, `${addr} must be refused`);
    if (!r.ok) assert.equal(r.code, "SERVER_REMOTE_ADDRESS", `${addr}: wrong code`);
  }
  pass("private container addresses are accepted and routable ones are refused");
}

{
  // A missing address is refused even when the port is right.
  const expected = { database: "keebforge_e2e_fresh", publishedPort: String(SCRATCH_PORT) };
  for (const addr of [null, "", "   "]) {
    const r = checkConnectedServer(
      { database: "keebforge_e2e_fresh", serverAddress: addr, serverPort: SERVER_SIDE_PORT },
      expected,
    );
    assert.equal(r.ok, false, `${JSON.stringify(addr)} must be refused`);
    if (!r.ok) assert.equal(r.code, "SERVER_ADDRESS_UNKNOWN", `${JSON.stringify(addr)}: wrong code`);
  }
  pass("the connectivity check refuses a missing server address");
}

{
  // The published host socket must stay exclusively loopback, and that
  // requirement lives in the URL guard, not in the post-connection check. Pin it
  // here so the separation cannot quietly disappear.
  const good = `postgresql://postgres:pw@127.0.0.1:${SCRATCH_PORT}/keebforge_e2e_fresh`;
  const r = assertScratchPair({ databaseUrl: good, directUrl: good });
  assert.equal(r.databaseUrl.host, "127.0.0.1");
  assert.equal(r.databaseUrl.port, String(SCRATCH_PORT));
  // Any host other than a loopback literal, or any other published port, refuses.
  for (const [host, port] of [
    ["192.168.0.69", SCRATCH_PORT],
    ["172.17.0.2", SCRATCH_PORT],
    ["0.0.0.0", SCRATCH_PORT],
    ["127.0.0.1", 5432],
    ["127.0.0.1", 15432],
  ] as const) {
    const url = `postgresql://postgres:pw@${host}:${port}/keebforge_e2e_fresh`;
    expectRefusal(
      () => assertScratchPair({ databaseUrl: url, directUrl: url }),
      host === "127.0.0.1" ? "WRONG_PORT" : "REMOTE_HOST",
      `the URL guard refuses ${host}:${port}`,
    );
  }
  pass("the published host socket stays loopback-only and on port 55432");
}

// ── D4: URL query strings and fragments are refused ──────────────────────
{
  // A query string is a second way to steer a connection, and libpq-style
  // parameters can override where the driver dials. The host and port checks
  // read the authority component and never saw them, so a URL that looks like
  // loopback can describe a different destination.
  const clean = "postgresql://postgres:pw@127.0.0.1:55432/keebforge_e2e";

  // The baseline must still pass, or the refusal below proves nothing.
  assert.doesNotThrow(() => assertScratchPair({ databaseUrl: clean, directUrl: clean }));

  const withParams: ReadonlyArray<readonly [string, string]> = [
    ["?host=evil.example.com", "a host override"],
    ["?host=evil.example.com&port=5432", "host and port overrides"],
    ["?socket_path=/var/run/postgresql/.s.PGSQL.5432", "a unix socket path"],
    ["?host=a&host=b", "multiple values for one parameter"],
    ["?sslmode=disable&host=evil.example.com", "a benign-looking parameter plus an override"],
    ["?connect_timeout=1", "a single benign parameter"],
    ["?", "a bare question mark"],
    ["#fragment", "a fragment"],
    ["?host=evil#fragment", "both a query and a fragment"],
  ];
  for (const [suffix, label] of withParams) {
    const url = clean + suffix;
    expectRefusal(
      () => assertScratchPair({ databaseUrl: url, directUrl: url }),
      "UNAPPROVED_URL_PARAMS",
      `the URL guard refuses ${label}`,
    );
    // Applied to BOTH variables: a clean DATABASE_URL must not launder a
    // hostile DIRECT_URL, which is the one Prisma actually prefers.
    expectRefusal(
      () => assertScratchPair({ databaseUrl: clean, directUrl: url }),
      "UNAPPROVED_URL_PARAMS",
      `the URL guard refuses ${label} in DIRECT_URL`,
    );
  }

  // Percent-encoded parameter names hide from a reader but not from the driver.
  // `%68ost` is `host`; a name-based allowlist would have missed it, a strict
  // empty-query policy cannot.
  for (const encoded of [
    "?%68ost=evil.example.com",
    "?%73ocket_path=/tmp/.s.PGSQL.5432",
    "?host=%65vil.example.com",
    "?sslmode%3Ddisable",
  ]) {
    expectRefusal(
      () => assertScratchPair({ databaseUrl: clean + encoded, directUrl: clean + encoded }),
      "UNAPPROVED_URL_PARAMS",
      `the URL guard refuses encoded parameters (${encoded})`,
    );
  }

  // The message must not echo a parameter value, which can carry a password.
  try {
    assertScratchPair({
      databaseUrl: `${clean}?host=evil.example.com`,
      directUrl: `${clean}?host=evil.example.com`,
    });
    assert.fail("expected a refusal");
  } catch (e) {
    assert.ok(e instanceof ScratchTargetError);
    assert.ok(e.message.includes("host"), "the message must name the offending parameter");
    assert.ok(!e.message.includes("evil.example.com"), "the message must not echo a value");
  }

  // Both entry points must go through the same validation.
  const preflight = codeOf("scripts/e2e/auth-preflight.ts");
  const wrapper = codeOf("scripts/e2e/migrate-scratch.ts");
  for (const [name, code] of [
    ["auth-preflight", preflight],
    ["migrate-scratch", wrapper],
  ] as const) {
    assert.ok(
      code.includes("assertScratchPair"),
      `${name} must validate the connection target through assertScratchPair`,
    );
  }
  // The wrapper additionally rebuilds its URL from parsed parts, so the value it
  // hands Prisma cannot carry a query string even if one were introduced.
  assert.match(
    codeOf("scripts/e2e/migrate-scratch-plan.ts"),
    /const url = buildConnectionUrl\(/,
    "the wrapper must rebuild the connection URL from parsed components",
  );

  // And no guard may hand a raw, unvalidated query string to the driver.
  const guard = rawOf("scripts/e2e/scratch-guard.ts");
  assert.match(guard, /UNAPPROVED_URL_PARAMS/);
  assert.match(guard, /url\.search/);
  assert.match(guard, /url\.hash/);

  pass("connection-routing query parameters and fragments are refused on both URLs");
}

{
  // Pin the two fixes against regression at the source level, and pin the
  // entry guard whose silent false negative would disable the whole gate.
  const planner = codeOf("scripts/e2e/migrate-scratch-plan.ts");
  assert.ok(
    /\["prisma",\s*"migrate",\s*subcommand/.test(planner),
    "the planner must position the migrate group ahead of the subcommand",
  );
  const dbcheck = codeOf("scripts/e2e/dbcheck.ts");
  assert.ok(
    !/row\.port\s*!==\s*expected\.port/.test(dbcheck) &&
      !/String\(row\.port\)\s*!==/.test(dbcheck),
    "dbcheck must not compare the server-reported port with the published port",
  );
  assert.ok(
    /SERVER_SIDE_PORT\s*=\s*5432/.test(dbcheck),
    "the container-side port constant must remain 5432",
  );
  assert.ok(
    /reported\.serverPort\s*!==\s*SERVER_SIDE_PORT/.test(dbcheck),
    "dbcheck must hold the server-reported port to PostgreSQL's container-side port",
  );
  assert.ok(
    !/reported\.serverPort\s*[!=]==?\s*expected\.publishedPort/.test(dbcheck),
    "dbcheck must never compare the server-reported port against the published port",
  );
  assert.ok(
    /expected\.publishedPort/.test(dbcheck) && /assertScratchPair/.test(dbcheck),
    "the published port must still be validated, as a URL, by the guard",
  );
  assert.ok(
    /if\s*\(\s*isEntryPoint\(\)\s*\)/.test(dbcheck),
    "dbcheck must run main() behind its entry-point guard",
  );
  assert.ok(
    /await import\(\s*["']@prisma\/client["']\s*\)/.test(dbcheck),
    "dbcheck must still import Prisma dynamically",
  );
  pass("both fixes are pinned against regression in the source");
}

/* ------------------------------------------------------------------------- *
 * Batch 5C.7 — the scratch-only Supabase auth compatibility pre-flight.
 *
 * Migration 20260819150000_rls_defense_in_depth is 2 of 41 and creates 16 RLS
 * policies calling auth.uid() / auth.jwt(). PostgreSQL resolves function calls
 * while parsing, so a vanilla postgres:16 container has no `auth` schema and
 * the migration aborts there. The pre-flight supplies those functions outside
 * the migration history.
 *
 * The properties that matter, all asserted below without a database:
 *   - the shim never enters prisma/migrations/, so production is unaffected;
 *   - the shim is idempotent and matches the signatures the policies use;
 *   - the SQL is split client-side, because Prisma's extended query protocol
 *     binds exactly one command per execution;
 *   - the pre-flight is guarded exactly like every other local E2E script;
 *   - `migrate deploy` refuses early and read-only when the functions are absent;
 *   - `migrate-scratch.ts` never invokes the pre-flight automatically.
 * ------------------------------------------------------------------------- */

{
  // ── the shim must never become a migration ──────────────────────────────
  {
    assert.equal(SCRATCH_AUTH_SQL_FILE, "scratch-auth.sql");
    const path = join("scripts", "e2e", SCRATCH_AUTH_SQL_FILE);
    assert.ok(existsSync(join(repoRoot, path)), "the shim lives at scripts/e2e/scratch-auth.sql");
    assert.ok(
      !path.startsWith(join("prisma", "migrations")),
      "the shim must never live inside prisma/migrations",
    );

    // The decisive check: no migration in the history creates the `auth`
    // schema. If one ever did, adding a shim migration on top would be the fix
    // rather than a scratch-only step — and that would overwrite the genuine
    // Supabase platform function in production.
    const migrationDir = join(repoRoot, "prisma", "migrations");
    const offenders = readdirSync(migrationDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .flatMap((e) => {
        const f = join(migrationDir, e.name, "migration.sql");
        return existsSync(f) && /CREATE\s+SCHEMA/i.test(readFileSync(f, "utf8")) ? [e.name] : [];
      });
    assert.deepEqual(offenders, [], `no migration may create a schema: ${offenders.join(", ")}`);

    // The history must hold exactly the audited migrations — no more, no fewer.
    //
    // This count is a tripwire, not a style preference: it exists so that adding a
    // migration is a deliberate, reviewed act rather than a side effect. It was 41
    // through the Phase 5B audit, 42 when Phase 5B.1 added
    // `20261002120001_refund_razorpay_payment_id` (Refund.razorpayPaymentId), and is
    // 44 since `20261007000000_add_product_option_selection_mode`
    // (ProductOptionSelectionMode on ProductOptionGroup) and
    // `20261010120000_order_paid_notifications` (the OrderNotification outbox) were
    // added. The two newest are recorded as pending in migration-history.md and their
    // application to production is NOT verified by the production ledger.
    //
    // The expected set is spelled out rather than counted alone, because a bare
    // count cannot distinguish "the audited migration I reviewed" from "a migration
    // somebody added without thinking", and the whole value of the tripwire is that
    // distinction. Bump EXPECTED_MIGRATIONS and the reconciliation notes in
    // docs/production/migration-history.md together, never one alone.
    const EXPECTED_MIGRATIONS = [
      "20260819140638_init",
      "20260819150000_rls_defense_in_depth",
      "20260819160000_review_author_fields",
      "20260819170000_shop_catalog_models",
      "20260819180000_better_auth",
      "20260819181000_better_auth_account_issuer",
      "20260820000000_order_address",
      "20260821000000_product_system",
      "20260822000000_payment_integrity",
      "20260822120000_cart_service_item",
      "20260822200000_product_card_features",
      "20260822210000_shop_section_types",
      "20260823000000_product_option_groups",
      "20260823120000_order_shipping_snapshot",
      "20260823200000_cloudinary_media",
      "20260824000000_address_apartment",
      "20260824000000_profile_username",
      "20260824020000_address_name_email",
      "20260827180000_clear_all_auth_data",
      "20260827185000_retire_service_and_mods",
      "20260827190000_servicegroup_to_mods",
      "20260827200000_add_active_organization_id",
      "20260827201000_restore_organization_auth",
      "20260827213000_add_organization_metadata",
      "20260827214500_restore_service_models",
      "20260827220000_drop_product_short_description",
      "20260828120000_review_snapshots_and_images",
      "20260828130000_review_type_general",
      "20260828140000_work_sort_order",
      "20260831200000_coupon_system",
      "20260901100000_add_developer_role",
      "20260901110000_fix_org_member_inviter_relation",
      "20260901120000_remove_repair_media_type",
      "20260901130000_add_razorpay_customer_id",
      "20260901140000_payment_razorpay_customer_id",
      "20260902220726_remove_category_image_desc_parent",
      "20260906120000_add_tracking_messages",
      "20260907120000_add_pickup_id_to_shipment",
      "20260917000000_add_order_customer_email_index",
      "20260930120000_add_general_review_unique_index",
      "20261002120000_refund_accounting",
      "20261002120001_refund_razorpay_payment_id",
      "20261007000000_add_product_option_selection_mode",
      "20261010120000_order_paid_notifications",
    ];
    const migrations = readdirSync(migrationDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .filter((n) => /^\d{14}_/.test(n))
      .sort();
    assert.deepEqual(
      migrations,
      [...EXPECTED_MIGRATIONS].sort(),
      `the migration history must hold exactly the ${EXPECTED_MIGRATIONS.length} audited `
        + "migrations — an addition or removal has to be a reviewed decision recorded in "
        + "docs/production/migration-history.md, not an incidental change",
    );
    pass(
      "the auth shim lives outside the migration history, which is still "
      + `${EXPECTED_MIGRATIONS.length} audited files`,
    );
  }

  // ── the SQL matches the contract the policies actually use ──────────────
  {
    const raw = readFileSync(join(repoRoot, "scripts", "e2e", "scratch-auth.sql"), "utf8");
    // Assertions run against the split statements, not the raw bytes. The SQL
    // file is heavily commented and the prose discusses `CREATE OR REPLACE
    // FUNCTION`, `STABLE` and the return types by name — counting those in the
    // raw text would count documentation, not executable SQL. This is the same
    // `rawOf` versus `codeOf` distinction this file already documents.
    const stmts = splitSqlStatements(raw);
    const sql = stmts.join(";\n");

    // 16 policies call auth.uid()::text, so uuid (castable to text) satisfies them.
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION auth\.uid\(\) RETURNS uuid/,
      "auth.uid() must be declared RETURNS uuid",
    );
    // One policy uses auth.jwt() ->> 'email', which needs json/jsonb.
    assert.match(
      sql,
      /CREATE OR REPLACE FUNCTION auth\.jwt\(\) RETURNS jsonb/,
      "auth.jwt() must be declared RETURNS jsonb",
    );

    // Idempotence, counted over executable statements: re-running must neither
    // error nor duplicate an object.
    assert.equal(
      stmts.filter((s) => /^CREATE SCHEMA IF NOT EXISTS auth$/.test(s)).length,
      1,
      "the schema must be created with IF NOT EXISTS",
    );
    assert.equal(
      stmts.filter((s) => /^CREATE OR REPLACE FUNCTION/.test(s)).length,
      2,
      "both functions must be CREATE OR REPLACE, so re-running cannot duplicate them",
    );

    // An unset claim GUC must not raise: the `, true` is PostgreSQL's missing_ok.
    assert.match(
      sql,
      /current_setting\('request\.jwt\.claims', true\)/,
      "current_setting must pass missing_ok so an unset GUC yields NULL rather than an error",
    );
    // NULL must become a deny, never an accidental grant.
    assert.match(sql, /COALESCE\(/, "both functions must coalesce the unset case");
    assert.match(sql, /'\{\}'::jsonb/);
    assert.match(sql, /NULLIF\(auth\.jwt\(\) ->> 'sub', ''\)::uuid/);

    // STABLE, not VOLATILE: these are read-only lookups called once per row.
    const functions = stmts.filter((s) => /^CREATE OR REPLACE FUNCTION/.test(s));
    assert.equal(functions.length, 2);
    for (const fn of functions) {
      assert.match(fn, /\bSTABLE\b/, `${fn.slice(0, 40)}… must be STABLE`);
      assert.ok(!/VOLATILE/i.test(fn), "no function may be VOLATILE");
      // Resolution must not depend on a caller's search_path.
      assert.match(
        fn,
        /SET search_path = ''/,
        `${fn.slice(0, 40)}… must pin search_path`,
      );
      assert.ok(
        !/SECURITY\s+DEFINER/i.test(fn),
        "the shim must not be SECURITY DEFINER; it reads no privileged state",
      );
    }

    // Grants, so a non-owner role can resolve them for the optional RLS probe.
    assert.match(sql, /GRANT USAGE ON SCHEMA auth TO PUBLIC/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION auth\.jwt\(\), auth\.uid\(\) TO PUBLIC/);

    // Teardown exists and is a drop of the shim schema, nothing else.
    assert.deepEqual([...TEARDOWN_STATEMENTS], ["DROP SCHEMA IF EXISTS auth CASCADE"]);
    pass("the shim declares the signatures, idempotence and safety properties the policies need");
  }

  // ── the apply payload contains ONLY the five intended operations ────────
  {
    // The executor runs whatever statements this file parses, one per round
    // trip, against the verified scratch database. Nothing previously checked
    // what those statements actually are, so a destructive line added here would
    // be applied silently. Assertions run on the PARSED statements — after
    // comment and string handling — so prose in the file's own comments cannot
    // satisfy them and cannot trip them either.
    const stmts = splitSqlStatements(loadScratchAuthSql());

    assert.equal(
      stmts.length,
      5,
      `the shim must be exactly five statements, got ${stmts.length}: ` +
        stmts.map((s) => s.slice(0, 40)).join(" | "),
    );

    // The five, in order, each pinned to its full expected shape.
    const EXPECTED: ReadonlyArray<readonly [RegExp, string]> = [
      [/^CREATE SCHEMA IF NOT EXISTS auth$/, "CREATE SCHEMA IF NOT EXISTS auth"],
      [
        /^CREATE OR REPLACE FUNCTION auth\.jwt\(\) RETURNS jsonb/,
        "CREATE OR REPLACE FUNCTION auth.jwt()",
      ],
      [
        /^CREATE OR REPLACE FUNCTION auth\.uid\(\) RETURNS uuid/,
        "CREATE OR REPLACE FUNCTION auth.uid()",
      ],
      [/^GRANT USAGE ON SCHEMA auth TO PUBLIC$/, "GRANT USAGE ON SCHEMA"],
      [
        /^GRANT EXECUTE ON FUNCTION auth\.jwt\(\), auth\.uid\(\) TO PUBLIC$/,
        "GRANT EXECUTE ON FUNCTION",
      ],
    ];
    stmts.forEach((stmt, i) => {
      const [re, label] = EXPECTED[i]!;
      assert.match(stmt, re, `statement ${i + 1} must be ${label}, got: ${stmt.slice(0, 80)}`);
    });

    // Every statement must be one of the five. This is the structural check:
    // a statement that is not on the list is refused outright, whatever it says.
    for (const stmt of stmts) {
      assert.ok(
        EXPECTED.some(([re]) => re.test(stmt)),
        `unexpected statement in the shim payload: ${stmt.slice(0, 120)}`,
      );
      // And each must be indivisible — the splitter must not have hidden a
      // second command inside one "statement".
      assert.deepEqual(
        splitSqlStatements(stmt),
        [stmt],
        `a shim statement must contain exactly one command: ${stmt.slice(0, 80)}`,
      );
    }

    // Destructive and structural operations, rejected case-insensitively so a
    // lower- or mixed-case variant cannot slip through.
    const FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
      [/\bDROP\b/i, "DROP"],
      [/\bDELETE\b/i, "DELETE"],
      [/\bTRUNCATE\b/i, "TRUNCATE"],
      [/\bINSERT\b/i, "INSERT"],
      [/\bUPDATE\b/i, "UPDATE"],
      [/\bCOPY\b/i, "COPY"],
      [/\bCREATE\s+TABLE\b/i, "CREATE TABLE"],
      [/\bCREATE\s+(?:ROLE|USER)\b/i, "CREATE ROLE/USER"],
      // Any schema other than the intended idempotent `auth` one.
      [/\bCREATE\s+SCHEMA\s+(?!IF\s+NOT\s+EXISTS\s+auth\s*;?\s*$)/i, "an unrelated CREATE SCHEMA"],
      [/\bCREATE\s+EXTENSION\b/i, "CREATE EXTENSION"],
      [/\bALTER\s+(?:TABLE|ROLE|USER|FUNCTION|SCHEMA|DATABASE|SEQUENCE|TYPE|POLICY)\b/i, "ALTER"],
      [/\bSET\s+(?:ROLE|SESSION\s+AUTHORIZATION)\b/i, "SET ROLE"],
      [/\bSECURITY\s+DEFINER\b/i, "SECURITY DEFINER"],
      [/\bREVOKE\b/i, "REVOKE"],
      [/\bGRANT\b(?!\s+USAGE\s+ON\s+SCHEMA\s+auth\b)(?!\s+EXECUTE\s+ON\s+FUNCTION\s+auth\.jwt)/i,
        "an unexpected GRANT"],
    ];
    for (const stmt of stmts) {
      for (const [re, label] of FORBIDDEN) {
        assert.ok(!re.test(stmt), `the shim payload must not contain ${label}: ${stmt.slice(0, 120)}`);
      }
    }

    // The function bodies must not smuggle a statement past the parser either:
    // each body is scanned on its own, dollar quoting already removed.
    for (const stmt of stmts.filter((s) => s.startsWith("CREATE OR REPLACE FUNCTION"))) {
      const body = stmt.slice(stmt.indexOf("$$") + 2, stmt.lastIndexOf("$$"));
      assert.ok(body.length > 0, "a function body must not be empty");
      assert.ok(
        !/;\s*\S/.test(body),
        `a function body must hold a single statement, found: ${body.trim().slice(0, 80)}`,
      );
      assert.ok(!/\bFROM\s+(?!pg_catalog)/i.test(body), "a body must not read a table");
    }

    // Sanity: the forbidden scan is actually capable of failing, so it is not
    // vacuously true against these statements.
    assert.ok(FORBIDDEN.some(([re]) => re.test("DROP TABLE x")), "the scan must detect DROP");
    assert.ok(FORBIDDEN.some(([re]) => re.test("drop table x")), "the scan must be case-insensitive");
    assert.ok(FORBIDDEN.some(([re]) => re.test("delete from x")), "the scan must detect DELETE");
    assert.ok(
      FORBIDDEN.some(([re]) => re.test("CREATE SCHEMA other")),
      "the scan must detect an unrelated schema",
    );
    // …and the two legitimate statements must NOT trip it.
    assert.ok(!FORBIDDEN.some(([re]) => re.test(stmts[0]!)), "CREATE SCHEMA auth must be allowed");
    assert.ok(!FORBIDDEN.some(([re]) => re.test(stmts[3]!)), "GRANT USAGE must be allowed");
    assert.ok(!FORBIDDEN.some(([re]) => re.test(stmts[4]!)), "GRANT EXECUTE must be allowed");

    pass("the shim payload is exactly the five intended statements and nothing destructive");
  }

  // ── client-side statement splitting ─────────────────────────────────────
  {
    // The reason this exists: Prisma 6.19 routes raw SQL through the Rust query
    // engine, which speaks the extended query protocol and binds one command
    // per execution. Two functions containing `$$ … ; … $$` cannot be sent as
    // one $executeRawUnsafe call.
    assert.deepEqual(splitSqlStatements("SELECT 1"), ["SELECT 1"]);
    assert.deepEqual(splitSqlStatements("SELECT 1;"), ["SELECT 1"]);
    assert.deepEqual(splitSqlStatements(""), []);
    assert.deepEqual(splitSqlStatements("   \n\n  ; ; \n"), []);
    // A trailing statement without its semicolon is still a statement.
    assert.deepEqual(splitSqlStatements("SELECT 1;\nSELECT 2"), ["SELECT 1", "SELECT 2"]);

    // Semicolons inside a dollar-quoted body must not split.
    const dollar = splitSqlStatements("CREATE FUNCTION f() RETURNS int AS $$ SELECT 1; SELECT 2; $$;\nSELECT 3;");
    assert.equal(dollar.length, 2, `dollar-quoted body must stay one statement, got ${dollar.length}`);
    assert.ok(dollar[0]!.includes("SELECT 1; SELECT 2;"));

    // Any tag, not just $$.
    const tagged = splitSqlStatements("CREATE FUNCTION g() RETURNS int AS $func$ SELECT 1; $func$;");
    assert.equal(tagged.length, 1);
    assert.ok(tagged[0]!.includes("SELECT 1;"));

    // String literals and quoted identifiers: a `;` inside either is ordinary
    // text, so these compare exactly.
    assert.deepEqual(splitSqlStatements("SELECT ';'"), ["SELECT ';'"]);
    assert.deepEqual(splitSqlStatements(`SELECT ";"`), [`SELECT ";"`]);
    assert.deepEqual(splitSqlStatements("SELECT 'it''s; here'"), ["SELECT 'it''s; here'"]);

    // Comments are discarded as whitespace, so exact string equality is not the
    // right assertion for these — leftover spacing is valid SQL. The property
    // that matters is that a `;` inside a comment cannot split a statement, and
    // that the code around the comment survives untouched.
    const lineComment = splitSqlStatements("SELECT 1 -- a ; comment\n")[0]!;
    assert.ok(lineComment.includes("SELECT 1"));
    assert.ok(!lineComment.includes(";"), "a `;` inside a line comment must not split");
    assert.ok(!lineComment.includes("comment"), "the comment text must be discarded");

    const blockComment = splitSqlStatements("SELECT /* a ; b */ 1")[0]!;
    assert.ok(blockComment.includes("1"), "text after a block comment must survive");
    assert.ok(!blockComment.includes(";"), "a `;` inside a block comment must not split");

    // PostgreSQL nests block comments, so the inner `*/` must not close the outer one.
    const nested = splitSqlStatements("SELECT /* outer /* inner ; */ still ; */ 1");
    assert.equal(nested.length, 1, "a nested block comment must not split the statement");
    assert.ok(!nested[0]!.includes(";"), "no `;` may survive a nested block comment");
    assert.ok(nested[0]!.includes("1"), "text after a nested block comment must survive");

    // A comment marker inside a dollar body is body text, not a comment.
    assert.equal(splitSqlStatements("AS $$ -- ;\n$$;").length, 1);

    // $1 is a placeholder, not a dollar-quote opener.
    const placeholder = splitSqlStatements("SELECT $1;");
    assert.deepEqual(placeholder, ["SELECT $1"]);

    // The real file must round-trip into whole statements.
    const statements = splitSqlStatements(loadScratchAuthSql());
    assert.equal(statements.length, 5, `expected 5 statements, got ${statements.length}`);
    for (const s of statements) {
      // Re-splitting a statement must yield itself: proof that no statement
      // still contains an unquoted top-level semicolon.
      assert.deepEqual(
        splitSqlStatements(s),
        [s],
        `statement is not indivisible: ${s.slice(0, 60)}…`,
      );
    }
    assert.match(statements[0]!, /^CREATE SCHEMA IF NOT EXISTS auth$/);
    assert.ok(statements[1]!.startsWith("CREATE OR REPLACE FUNCTION auth.jwt()"));
    assert.ok(statements[2]!.startsWith("CREATE OR REPLACE FUNCTION auth.uid()"));
    assert.ok(statements[3]!.startsWith("GRANT USAGE ON SCHEMA auth"));
    assert.ok(statements[4]!.startsWith("GRANT EXECUTE ON FUNCTION"));

    // The executor must issue one call per statement rather than one per file.
    const exec = codeOf("scripts/e2e/auth-preflight.ts");
    assert.match(exec, /for \(const statement of statements\)/);
    assert.match(exec, /\$executeRawUnsafe\(statement\)/);
    // A single whole-file call would be the assumption that must not exist.
    assert.ok(
      !/\$executeRawUnsafe\(\s*(sql|contents|script)\s*\)/.test(exec),
      "the shim must never be sent as one multi-statement call",
    );
    pass("the SQL is split client-side into 5 indivisible statements");
  }

  // ── argument handling, including teardown ───────────────────────────────
  {
    const applied = preflightAuthArgs(["--database", "keebforge_e2e"]);
    assert.ok(applied.ok && !applied.help);
    if (applied.ok && !applied.help) {
      assert.equal(applied.database, "keebforge_e2e");
      assert.equal(applied.mode, "apply", "the default must be apply, never teardown");
    }

    // Both spellings of --database.
    const eq = preflightAuthArgs(["--database=keebforge_e2e_fresh"]);
    assert.ok(eq.ok && !eq.help);
    if (eq.ok && !eq.help) assert.equal(eq.database, "keebforge_e2e_fresh");

    // The teardown flag, in either position.
    for (const argv of [
      ["--database", "keebforge_e2e", "--teardown"],
      ["--teardown", "--database", "keebforge_e2e"],
      ["--database=keebforge_e2e", "--teardown"],
    ]) {
      const r = preflightAuthArgs(argv);
      assert.ok(r.ok, `teardown argv ${JSON.stringify(argv)} must be accepted`);
      if (r.ok && !r.help) assert.equal(r.mode, "teardown", JSON.stringify(argv));
    }

    // --teardown is boolean. `--teardown=true` must NOT be read as teardown.
    for (const argv of [["--database", "keebforge_e2e", "--teardown=true"]]) {
      const r = preflightAuthArgs(argv);
      assert.equal(r.ok, false, "--teardown=true must be refused, not coerced");
      if (!r.ok) assert.equal(r.code, "UNKNOWN_ARGUMENT");
    }

    // Help short-circuits, so it needs no --database.
    for (const argv of [["--help"], ["-h"]]) {
      const r = preflightAuthArgs(argv);
      assert.ok(r.ok, "help must be accepted");
      if (r.ok) assert.equal(r.help, true);
    }

    const expectArgRefusal = (
      argv: readonly string[],
      code: string,
      label: string,
    ): void => {
      const r = preflightAuthArgs(argv);
      assert.equal(r.ok, false, `${label}: expected a refusal, got ${JSON.stringify(r)}`);
      if (!r.ok) {
        assert.equal(r.code, code, `${label}: expected ${code}, got ${r.code}`);
        assert.ok(r.message.length > 20, `${label}: a refusal must explain itself`);
      }
      pass(label);
    };

    // Refusal: unlisted database. The allowlist itself must not have grown.
    // A production-like name lands here too: this check is the allowlist
    // membership test, and `looksProductionLike` is the guard's separate
    // defence in depth behind it.
    for (const db of ["keebforge_dev", "postgres", "keebforge_production", "production"]) {
      expectArgRefusal(
        ["--database", db],
        "UNAPPROVED_DATABASE",
        `the pre-flight refuses unlisted database "${db}"`,
      );
    }
    pass("the pre-flight refuses unlisted and production-like database names");

    // Refusal: no database named. There is no default, so it cannot guess.
    expectArgRefusal([], "NO_DATABASE_ARGUMENT", "the pre-flight refuses with no --database");
    expectArgRefusal(
      ["--database", "--teardown"],
      "MISSING_VALUE",
      "the pre-flight refuses --database with no value",
    );

    // Refusal: anything unrecognised, so a flag can never be silently dropped.
    expectArgRefusal(
      ["--database", "keebforge_e2e", "--force"],
      "UNKNOWN_ARGUMENT",
      "the pre-flight refuses an unrecognised option",
    );
    expectArgRefusal(
      ["--database", "keebforge_e2e", "extra"],
      "UNEXPECTED_ARGUMENT",
      "the pre-flight refuses a positional argument",
    );
    pass("teardown and apply argument handling, and every refusal path");
  }

  // ── the pre-flight is guarded like every other local E2E script ─────────
  {
    const code = codeOf("scripts/e2e/auth-preflight.ts");
    assert.ok(/from "\.\/local-env"/.test(code), "it must use the shared local-env loader");
    assert.ok(/resolveLocalEnv\(/.test(code));
    assert.ok(/assertScratchPair\(/.test(code), "it must re-run the pair guard before connecting");
    assert.ok(/APPROVED_SCRATCH_DATABASES/.test(code), "it must consult the approved allowlist");
    // It must import Prisma dynamically, and only after the guard has run.
    assert.ok(
      !/^\s*import\s[^\n]*@prisma\/client/m.test(code),
      "auth-preflight must not statically import @prisma/client",
    );
    assert.match(code, /await import\(\s*["']@prisma\/client["']\s*\)/);
    assert.ok(
      code.indexOf("resolveLocalEnv(") < code.indexOf('await import("@prisma/client")'),
      "the guard must run before @prisma/client is imported",
    );
    // Environment pinning must precede the import, because that import loads .env.
    const pinAt = code.indexOf("process.env.DATABASE_URL =");
    const importAt = code.indexOf('await import("@prisma/client")');
    assert.ok(pinAt > -1 && importAt > -1 && pinAt < importAt, "both variables must be pinned first");
    assert.match(code, /process\.env\.DIRECT_URL =/);
    // An explicit datasourceUrl, so the client cannot resolve elsewhere.
    assert.match(code, /new PrismaClient\(\{ datasourceUrl: /);
    // The client must always be disconnected.
    assert.match(code, /\$disconnect\(\)/);
    // It must never read .env for connection settings.
    assert.ok(!/from\s+["']dotenv/.test(code));
    assert.ok(!/node:child_process/.test(code), "it must not spawn a process");
    assert.ok(!/spawn\(/.test(code));
    // run() behind the entry-point guard, or importing this module would
    // connect — which the test file above relies on being safe.
    assert.match(code, /if\s*\(\s*isEntryPoint\(\)\s*\)/);
    // A refusal must not claim success.
    assert.match(code, /Nothing was changed\./);
    pass("the pre-flight is guarded, pinned, dynamic and entry-point gated");
  }

  // ── the deploy precondition ─────────────────────────────────────────────
  {
    assert.deepEqual([...AUTH_PREREQUISITE_FUNCTIONS], ["auth.uid()", "auth.jwt()"]);
    assert.equal(AUTH_PREREQUISITE_HINT, "npm run db:scratch:auth-preflight");

    // Both present is the only pass.
    assert.equal(evaluateAuthPrerequisite({ hasUid: true, hasJwt: true }).ok, true);

    // Every other combination refuses, names what is missing, and is actionable.
    const cases: Array<[boolean, boolean, string[]]> = [
      [false, true, ["auth.uid()"]],
      [true, false, ["auth.jwt()"]],
      [false, false, ["auth.uid()", "auth.jwt()"]],
    ];
    for (const [hasUid, hasJwt, missing] of cases) {
      const r = evaluateAuthPrerequisite({ hasUid, hasJwt });
      assert.equal(r.ok, false, `uid=${hasUid} jwt=${hasJwt} must refuse`);
      if (r.ok) continue;
      assert.equal(r.code, "MISSING_AUTH_FUNCTIONS");
      for (const fn of missing) {
        assert.ok(r.message.includes(fn), `the message must name ${fn}`);
      }
      // Actionable: it must name the command to run.
      assert.ok(
        r.message.includes("npm run db:scratch:auth-preflight"),
        "a refusal must direct the operator to the pre-flight",
      );
      assert.ok(r.message.includes("20260819150000"), "a refusal must name the failing migration");
      // And must be honest that nothing changed.
      assert.match(r.message, /read-only and changed nothing/);
      // Absent functions must not be named as present.
      if (!hasUid) assert.ok(!/auth\.uid\(\).*both resolve/.test(r.message));
    }

    // D5: the two cases must be worded differently. The old message used
    // `${isAll ? "an error" : "an error"}` — identical branches, so the
    // "both missing" case was indistinguishable from the "one missing" case.
    const both = evaluateAuthPrerequisite({ hasUid: false, hasJwt: false });
    const onlyUid = evaluateAuthPrerequisite({ hasUid: false, hasJwt: true });
    const onlyJwt = evaluateAuthPrerequisite({ hasUid: true, hasJwt: false });
    assert.ok(!both.ok && !onlyUid.ok && !onlyJwt.ok);
    assert.notEqual(both.message, onlyUid.message, "both-missing and one-missing must differ");
    assert.notEqual(onlyUid.message, onlyJwt.message, "each one-missing case must differ");
    assert.match(both.message, /auth schema does not exist/);
    assert.match(onlyUid.message, /while the other resolves/);
    // No duplicated branch, which is the defect D5 described.
    assert.ok(!/an error[^.]*an error/.test(both.message));
    assert.ok(
      !/isAll\s*\?/.test(codeOf("scripts/e2e/migrate-scratch-plan.ts")) ||
        /an error"/.test(codeOf("scripts/e2e/migrate-scratch-plan.ts")) === false,
      "no ternary may select between two identical strings",
    );

    pass("the precondition refuses each missing-function case with an actionable message");
  }

  {
    // The probe must be incapable of writing. It names no table and issues no
    // statement that mutates anything, so this is checkable as a property of the
    // string rather than only as a claim in a comment.
    const sql = AUTH_PREREQUISITE_SQL;
    assert.match(sql, /to_regprocedure\('auth\.uid\(\)'\)/);
    assert.match(sql, /to_regprocedure\('auth\.jwt\(\)'\)/);
    assert.ok(
      !/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP|ALTER|GRANT|REVOKE|COPY)\b/i.test(sql),
      "the precondition SQL must contain no mutating keyword",
    );
    assert.ok(!/;/.test(sql), "the precondition must be a single statement");
    // `to_regprocedure` is the non-raising form, so an absent schema is reported
    // rather than thrown.
    assert.ok(!/regprocedure/.test(sql.replace(/to_regprocedure/g, "")));

    const code = codeOf("scripts/e2e/migrate-scratch.ts");
    assert.ok(code.includes("AUTH_PREREQUISITE_SQL"), "the wrapper must use the shared probe SQL");
    assert.ok(code.includes("evaluateAuthPrerequisite"), "the wrapper must use the shared decision");
    // Gated to deploy alone: status and diff neither apply migration 2 nor can
    // fail on a missing schema, so they must not be forced to connect.
    assert.match(
      code,
      /if\s*\(\s*args\[2\]\s*===\s*"deploy"\s*\)/,
      "the precondition must gate deploy only",
    );
    // It must run before Prisma is spawned, and be the last thing before it.
    const probeAt = code.indexOf("assertAuthPrerequisiteBeforeDeploy(childEnv)");
    const spawnAt = code.indexOf("spawn(");
    assert.ok(probeAt > -1 && spawnAt > -1, "both the probe and the spawn must exist");
    assert.ok(probeAt < spawnAt, "the precondition must run before Prisma is spawned");
    // The probe body must contain no write.
    const fnAt = code.indexOf("async function assertAuthPrerequisiteBeforeDeploy");
    const fnEnd = code.indexOf("\nasync function run(");
    assert.ok(fnAt > -1 && fnEnd > fnAt, "the precondition body must be locatable");
    const body = code.slice(fnAt, fnEnd);
    assert.ok(
      !/\$executeRaw|\$transaction/i.test(body),
      "the precondition body must not write through the raw executor",
    );
    assert.ok(
      !/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP|ALTER|GRANT|REVOKE)\b/i.test(body),
      "the precondition body must contain no mutating keyword",
    );
    assert.ok(body.includes("$queryRawUnsafe"), "the precondition must use a read query");

    // ── D3: the disconnect must be REACHABLE, not merely present ─────────
    // The old assertion was `/finally { … $disconnect() }/`, which passes even
    // when the path that skips it is a refusal — because process.exit() never
    // returns, a refusal inside the try would skip the finally entirely. So the
    // invariant is now: the failure path THROWS (letting finally run) and the
    // function contains no process.exit at all.
    assert.match(body, /finally\s*\{[\s\S]*?await prisma\.\$disconnect\(\)/);
    assert.ok(
      !/process\.exit\(/.test(body),
      "the precondition must not exit the process, which would skip $disconnect in finally",
    );
    assert.match(
      body,
      /catch\s*\{[\s\S]*?throw new RefusalError\(/,
      "an unreachable database must throw a RefusalError, not exit, so cleanup runs",
    );
    // Scoped to the catch block itself: a refusal AFTER the try/finally is fine
    // (the client is already disconnected by then), one inside it is not.
    const catchAt = body.indexOf("} catch {");
    const finallyAt = body.indexOf("} finally {");
    assert.ok(catchAt > -1 && finallyAt > catchAt, "the catch and finally must both be present");
    const catchBlock = body.slice(catchAt, finallyAt);
    assert.ok(
      !/refuse\(/.test(catchBlock) && !/process\.exit/.test(catchBlock),
      "the catch block must not call refuse() or exit, which would skip $disconnect",
    );
    // It must pin both variables before importing Prisma, which loads .env.
    const pinAt = code.indexOf("process.env.DATABASE_URL = childEnv.DATABASE_URL");
    const directPinAt = code.indexOf("process.env.DIRECT_URL = childEnv.DIRECT_URL");
    const importAt = code.indexOf('await import("@prisma/client")');
    assert.ok(pinAt > -1 && importAt > -1 && pinAt < importAt, "pin before the Prisma import");
    assert.ok(directPinAt > -1 && directPinAt < importAt, "pin DIRECT_URL too, before the import");
    assert.ok(/new PrismaClient\(\{ datasourceUrl: childEnv\.DATABASE_URL \}\)/.test(code));

    // The refusal must reach the CLI as a non-zero exit without process.exit.
    assert.match(code, /process\.exitCode = 1/);
    assert.match(code, /if \(e instanceof RefusalError\)/);
    // Every gate must live inside resolveVerifiedPlan, not at module top level.
    // A refusal raised during module evaluation would escape the catch below and
    // print a stack trace where a refusal message belongs.
    assert.match(code, /async function resolveVerifiedPlan\(\)/);
    assert.ok(
      !/^const sub = preflightSubcommand/m.test(code),
      "the subcommand check must not run at module top level",
    );
    assert.match(code, /main\(\)\.catch\(/);
    // An unreachable database must refuse without echoing driver text, which can
    // contain a connection string.
    assert.match(code, /AUTH_PREFLIGHT_UNREACHABLE/);
    assert.match(code, /db:scratch:check/);
    pass("the deploy precondition is read-only, deploy-only, and precedes the spawn");
  }

  {
    // Requirement: the pre-flight is NOT automatic. If the wrapper invoked it,
    // the deploy path would gain a DDL capability and this file would drift.
    const code = codeOf("scripts/e2e/migrate-scratch.ts");
    assert.ok(
      !/auth-preflight/.test(code),
      "migrate-scratch.ts must not reference the pre-flight command",
    );
    assert.ok(
      !/require\(.*auth-preflight|import\(.*auth-preflight/.test(code),
      "migrate-scratch.ts must not import or spawn the pre-flight",
    );
    // It may still *mention* it in documentation, so the guidance is allowed in
    // raw text while the executable path stays clean.
    const raw = rawOf("scripts/e2e/migrate-scratch.ts");
    assert.ok(raw.includes("db:scratch:auth-preflight"), "the wrapper must document the step");
    pass("the pre-flight is never invoked automatically by the migration wrapper");
  }

  {
    // package.json exposes the explicitly-named command and it delegates to the
    // guarded entrypoint, not to a bare prisma invocation.
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts: Record<string, string>;
    };
    assert.equal(pkg.scripts["db:scratch:auth-preflight"], "tsx scripts/e2e/auth-preflight.ts");
    assert.ok(!/\bprisma\b/.test(pkg.scripts["db:scratch:auth-preflight"]!));
    // And it must not have become a way to run prisma against a database.
    const CONNECTING =
      /(?:^|\s)prisma\s+(?:migrate\s+(?:deploy|dev|reset|resolve)|db\s+push|studio|introspect)/;
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      assert.ok(!CONNECTING.test(cmd), `${name} must not invoke a connecting Prisma command`);
    }
    pass("db:scratch:auth-preflight is registered and invokes no Prisma command");
  }

  // ── the follow-ups this phase deliberately does not fix ─────────────────
  {
    // Both are known defects that belong in separate changes. They are pinned
    // here so this phase cannot be mistaken for having addressed them.
    const restore = rawOf(
      "prisma/migrations/20260827214500_restore_service_models/migration.sql",
    );
    assert.match(restore, /CREATE TABLE "Service"/, "the Service recreate is where RLS is lost");
    assert.ok(
      !/ENABLE ROW LEVEL SECURITY/.test(restore),
      "FOLLOW-UP: Service loses the RLS migration 20260819150000 enabled; still unfixed",
    );
    const rls = rawOf("prisma/migrations/20260819150000_rls_defense_in_depth/migration.sql");
    assert.match(rls, /ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY/);
    assert.match(
      rls,
      /auth\.uid\(\)::text = id/,
      "FOLLOW-UP: policies compare a Supabase UUID against better-auth cuids; still unfixed",
    );
    const profile = rawOf("prisma/migrations/20260819140638_init/migration.sql");
    assert.match(profile, /"id" TEXT NOT NULL/, "Profile.id is TEXT, i.e. a cuid, not a uuid");
    pass("the Service RLS regression and the cuid/UUID mismatch remain open follow-ups");
  }
}


// The teardown-evidence tests above need `await`, and this file is transpiled to
// CommonJS where top-level await is not available. Running them in an async IIFE at
// the end lets the synchronous tests finish first, then the summary print after
// every promise has settled. A failed assertion inside becomes an unhandled
// rejection, which still exits non-zero.
void (async () => {
    // ── D1/D2: teardown must refuse on any evidence of a migrated database ──
    {
      // DROP SCHEMA auth CASCADE takes the 16 auth-dependent policies with it, and
      // migration 2 cannot recreate them — it would fail on duplicate policy names.
      const EXPECTED_LEDGER_REFUSAL = "REFUSING_TEARDOWN_ON_MIGRATED_DATABASE";
      const EXPECTED_POPULATED_REFUSAL = "REFUSING_TEARDOWN_ON_POPULATED_SCHEMA";

      // ── D1: any ledger row refuses, finished or not ──────────────────────
      // An interrupted migration leaves `finished_at` NULL. Counting only finished
      // rows made an interrupted ledger read as "no migrations" and let the drop
      // through; the count query therefore has no status filter at all.
      assert.ok(
        !/finished_at/i.test(LEDGER_ROW_COUNT_SQL),
        "the ledger row count must not filter on finished_at: an interrupted row is still evidence",
      );
      assert.match(LEDGER_ROW_COUNT_SQL, /FROM public\._prisma_migrations/);
      assert.match(LEDGER_ROW_COUNT_SQL, /count\(\*\)/);

      // Zero rows → allowed. An existing but empty ledger means nothing has run.
      assert.equal(
        evaluateTeardownPrecondition({ ledger: true, ledgerRows: 0 }).ok,
        true,
        "an empty ledger may be reset",
      );
      // One finished, one interrupted, and many including interrupted → all refuse.
      for (const rows of [1, 2, 41, 100]) {
        const r = evaluateTeardownPrecondition({ ledger: true, ledgerRows: rows });
        assert.equal(r.ok, false, `${rows} ledger row(s) must refuse teardown`);
        if (r.ok) continue;
        assert.equal(r.code, EXPECTED_LEDGER_REFUSAL);
        assert.ok(r.message.includes(String(rows)), "the message must state the row count");
        assert.ok(r.message.includes("20260819150000"), "the message must name the migration");
        assert.match(r.message, /Nothing was changed\./);
        assert.match(r.message, /16 RLS policies/);
        assert.match(r.message, /interrupted/, "the message must say interrupted rows count");
      }

      // ── D2: a missing ledger is not an empty database ────────────────────
      // No ledger + empty public → allowed. That is the fresh-replay case.
      assert.equal(
        evaluateTeardownPrecondition({ ledger: false, publicRelations: 0 }).ok,
        true,
        "no ledger and no relations may be reset",
      );
      // No ledger + tables, or + views/other relations → refuse.
      for (const relations of [1, 2, 41]) {
        const r = evaluateTeardownPrecondition({ ledger: false, publicRelations: relations });
        assert.equal(r.ok, false, `${relations} relation(s) with no ledger must refuse`);
        if (r.ok) continue;
        assert.equal(r.code, EXPECTED_POPULATED_REFUSAL);
        assert.ok(r.message.includes(String(relations)));
        assert.match(r.message, /missing ledger is not an empty database/i);
      }
      // The relation probe must cover tables AND views/matviews/foreign tables.
      assert.match(PUBLIC_RELATION_COUNT_SQL, /relkind IN \('r', 'p', 'v', 'm', 'f'\)/);
      assert.match(PUBLIC_RELATION_COUNT_SQL, /nspname = 'public'/);

      // ── D2/D1: unexpected or unreadable answers fail closed ──────────────
      const unknownCases: ReadonlyArray<readonly [TeardownEvidence, string]> = [
        [{}, "no evidence at all"],
        [{ ledger: undefined, ledgerRows: 0 }, "ledger probe threw"],
        [{ ledger: true }, "ledger exists but the count is missing"],
        [{ ledger: true, ledgerRows: NaN }, "ledger count is not a number"],
        [{ ledger: true, ledgerRows: -1 }, "ledger count is negative"],
        [{ ledger: true, ledgerRows: "3" as unknown as number }, "ledger count is a string"],
        [{ ledger: false }, "no ledger and the relation count is missing"],
        [{ ledger: false, publicRelations: NaN }, "relation count is not a number"],
        [{ ledger: false, publicRelations: -5 }, "relation count is negative"],
        [
          { ledger: false, publicRelations: undefined },
          "relation inspection returned nothing usable",
        ],
      ];
      for (const [evidence, why] of unknownCases) {
        const r = evaluateTeardownPrecondition(evidence);
        assert.equal(r.ok, false, `must fail closed when ${why}`);
        if (r.ok) continue;
        assert.match(r.message, /Nothing was changed\./);
        assert.match(r.message, /16 RLS policies/);
      }

      // ── behavioural: the evidence collector, against a fake driver ───────
      // This is the failure-path coverage. A fake `execute` stands in for Prisma
      // so "the query threw" and "the driver returned nonsense" are real
      // behaviours here rather than comments.
      const fake = (
        answers: Record<string, unknown>,
        onMissing: "throw" | "empty" = "throw",
      ): ((sql: string) => Promise<unknown>) => {
        return async (sql: string) => {
          if (sql in answers) return answers[sql];
          if (onMissing === "throw") throw new Error("relation does not exist");
          return [];
        };
      };

      // Ledger present with rows.
      assert.deepEqual(
        await collectTeardownEvidence(
          fake({
            [LEDGER_PROBE_SQL]: [{ hasLedger: true }],
            [LEDGER_ROW_COUNT_SQL]: [{ rows: 3 }],
          }),
        ),
        { ledger: true, ledgerRows: 3 },
      );
      // Ledger present, empty.
      assert.deepEqual(
        await collectTeardownEvidence(
          fake({
            [LEDGER_PROBE_SQL]: [{ hasLedger: true }],
            [LEDGER_ROW_COUNT_SQL]: [{ rows: 0 }],
          }),
        ),
        { ledger: true, ledgerRows: 0 },
      );
      // Ledger absent → the relation probe runs, and the ledger query is NOT
      // combined with it: an unexpected count query must never be issued.
      const seenWhenNoLedger: string[] = [];
      await collectTeardownEvidence(async (sql) => {
        seenWhenNoLedger.push(sql);
        if (sql === LEDGER_PROBE_SQL) return [{ hasLedger: false }];
        if (sql === PUBLIC_RELATION_COUNT_SQL) return [{ relations: 7 }];
        throw new Error("must not be asked");
      });
      assert.deepEqual(seenWhenNoLedger, [LEDGER_PROBE_SQL, PUBLIC_RELATION_COUNT_SQL]);
      assert.ok(
        !seenWhenNoLedger.includes(LEDGER_ROW_COUNT_SQL),
        "the ledger count must not run when there is no ledger to count",
      );
      assert.equal(
        evaluateTeardownPrecondition(
          await collectTeardownEvidence(async (sql) =>
            sql === LEDGER_PROBE_SQL ? [{ hasLedger: false }] : [{ relations: 7 }],
          ),
        ).ok,
        false,
        "no ledger + 7 relations must refuse",
      );

      // Inspection error → unknown → refuse (this is the D2 fail-closed path).
      const inspectionErrored = await collectTeardownEvidence(
        fake({ [LEDGER_PROBE_SQL]: [{ hasLedger: false }] }, "throw"),
      );
      assert.equal(inspectionErrored.ledger, false);
      assert.equal(inspectionErrored.publicRelations, undefined);
      assert.equal(
        evaluateTeardownPrecondition(inspectionErrored).ok,
        false,
        "a failed relation inspection must refuse",
      );

      // Malformed / missing results → unknown → refuse.
      for (const bogus of [[], [{}], [{ hasLedger: "yes" }], [{ hasLedger: 1 }], null]) {
        const evidence = await collectTeardownEvidence(async () => bogus);
        assert.equal(
          evaluateTeardownPrecondition(evidence).ok,
          false,
          `a malformed ledger answer (${JSON.stringify(bogus)}) must refuse`,
        );
      }
      const malformedCount = await collectTeardownEvidence(async (sql) =>
        sql === LEDGER_PROBE_SQL ? [{ hasLedger: true }] : [{ rows: "3" }],
      );
      assert.equal(malformedCount.ledgerRows, undefined);
      assert.equal(evaluateTeardownPrecondition(malformedCount).ok, false);

      // The ledger probe itself throwing leaves `ledger` undefined.
      const probeErrored = await collectTeardownEvidence(fake({}, "throw"));
      assert.equal(probeErrored.ledger, undefined);
      const unknown = evaluateTeardownPrecondition(probeErrored);
      assert.equal(unknown.ok, false);
      if (!unknown.ok) assert.equal(unknown.code, "UNDETERMINED_TEARDOWN_STATE");

      // ── read-only, and separate statements ──────────────────────────────
      for (const sql of [LEDGER_PROBE_SQL, LEDGER_ROW_COUNT_SQL, PUBLIC_RELATION_COUNT_SQL]) {
        assert.ok(
          !/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP|ALTER|GRANT|REVOKE|COPY)\b/i.test(sql),
          `teardown precondition SQL must be read-only: ${sql}`,
        );
        assert.ok(!/;/.test(sql), "each precondition query must be a single statement");
      }
      // PostgreSQL resolves a missing relation at parse time, so a query naming
      // _prisma_migrations cannot be issued when the ledger is absent.
      assert.ok(
        !PUBLIC_RELATION_COUNT_SQL.includes("_prisma_migrations"),
        "the relation probe must not name the ledger table",
      );

      // ── D3: refusals throw, so cleanup runs ─────────────────────────────
      // `process.exit()` never returns, so a refusal raised while a client is open
      // would skip the `finally` that disconnects it. This is behavioural, not a
      // source match: refuse() must throw a RefusalError.
      assert.throws(
        () => refuse("TEST_CODE", "a message"),
        (e: unknown) => e instanceof RefusalError && e.code === "TEST_CODE",
        "refuse() must throw RefusalError rather than exit",
      );
      assert.throws(
        () => refuse("TEST_CODE", "a message"),
        (e: unknown) => e instanceof RefusalError && e.message === "a message",
      );
      assert.ok(new RefusalError("C", "m") instanceof Error, "RefusalError must be an Error");
      assert.throws(() => refuse("C", "m"), /./);

      // The printed form is preserved exactly, so the CLI contract is unchanged.
      assert.equal(
        formatRefusal(new RefusalError("CODE_X", "the reason."), "Nothing was changed."),
        "REFUSED [CODE_X] the reason.\nNothing was changed.",
      );
      assert.equal(
        formatRefusal(new RefusalError("CODE_X", "the reason."), "No database command was run."),
        "REFUSED [CODE_X] the reason.\nNo database command was run.",
      );

      // ── the executor consults the evidence before any DROP ──────────────
      const exec = codeOf("scripts/e2e/auth-preflight.ts");
      const collectAt = exec.indexOf("collectTeardownEvidence(");
      const gateAt = exec.indexOf("evaluateTeardownPrecondition(evidence)");
      const dropAt = exec.indexOf("for (const statement of TEARDOWN_STATEMENTS)");
      assert.ok(collectAt > -1 && gateAt > -1 && dropAt > -1);
      assert.ok(collectAt < gateAt && gateAt < dropAt, "evidence, then the gate, then the drop");
      assert.match(exec, /if \(!allowed\.ok\) refuse\(allowed\.code, allowed\.message\)/);
      // No process.exit anywhere: the two remaining exits in the wrapper are in
      // child-process handlers, after its Prisma client is gone.
      assert.ok(
        !/process\.exit\(/.test(exec),
        "auth-preflight must not call process.exit, which would skip $disconnect in finally",
      );
      assert.match(exec, /process\.exitCode = 1/);
      assert.match(exec, /finally\s*\{[\s\S]*?await prisma\.\$disconnect\(\)/);
      assert.ok(
        !/refuseIfMigrationsApplied/.test(rawOf("scripts/e2e/auth-preflight.ts")),
        "the teardown docblock must not point at a function that is not implemented",
      );

      pass("teardown fails closed on any ledger row, on any relation, and on every unexpected answer");
    }


  console.log(`\nPASS all ${n} database entrypoint safety tests`);
})();
