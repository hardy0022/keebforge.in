import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, join as joinPath } from "node:path";
import {
  APPROVED_SCRATCH_DATABASES,
  SCRATCH_PORT,
  ScratchTargetError,
  assertScratchPair,
  looksProductionLike,
} from "./scratch-guard";
import {
  SAFE_SUBCOMMANDS,
  buildConnectionUrl,
  planMigrationRun,
  preflightSubcommand,
  type ScratchEnv,
} from "./migrate-scratch-plan";
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

console.log(`\nPASS all ${n} database entrypoint safety tests`);
