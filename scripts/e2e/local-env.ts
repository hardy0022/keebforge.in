import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  APPROVED_SCRATCH_DATABASES,
  SCRATCH_PORT,
  ScratchTargetError,
  assertScratchPair,
  type Target,
} from "./scratch-guard";

/**
 * Local environment loading for disposable-database commands.
 *
 * WHY A DEDICATED FILE, AND WHY NOT `.env.local`
 *
 * Next 16 loads env files in this order, first match winning per key:
 *
 *   .env.<NODE_ENV>.local   .env.local   .env.<NODE_ENV>   .env
 *
 * The `.env.local` entry is included in **production** too — the loader's
 * filter is `NODE_ENV !== 'test'`, not `=== 'development'`. So a database URL
 * placed in `.env.local` would shadow the production value in `.env` during a
 * production build. That is a production configuration change disguised as a
 * local convenience, so `.env.local` is not used here.
 *
 * Next only ever loads `.env.${NODE_ENV}`, and `NODE_ENV` is never `e2e`, so
 * `.env.e2e.local` is invisible to the application build entirely. That makes it
 * the right home for disposable connection settings: the app cannot pick them up
 * by accident, and nothing local can leak into production.
 *
 * WHY AN EXPLICIT LOADER RATHER THAN RELYING ON dotenv
 *
 * The incident this guards against came from connection values arriving by
 * inheritance rather than by decision. A loader that reads one named file, names
 * the file in its errors, and refuses when the file is absent means a missing
 * local config is a hard stop. The alternative — letting `dotenv` pick whichever
 * file it likes and inheriting the result — is how `.env`'s production
 * `DIRECT_URL` reached a scratch command in the first place.
 *
 * dotenv never overrides an already-set variable, so values assigned here win
 * over `.env` even when Prisma later loads it.
 */

export const LOCAL_ENV_FILE = ".env.e2e.local";

export class LocalEnvError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "LocalEnvError";
    this.code = code;
  }
}

/**
 * Minimal `KEY=VALUE` parser.
 *
 * Deliberately not dotenv. Two reasons: the file is a flat list of simple
 * assignments, and pulling in a loader that also reads `.env` would reintroduce
 * the inheritance this module exists to prevent. Blank lines and `#` comments are
 * skipped; values may be quoted or bare.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) {
      throw new LocalEnvError(
        "MALFORMED_LINE",
        `A line in the local env file is not a KEY=VALUE assignment: ${JSON.stringify(rawLine)}`,
      );
    }

    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      throw new LocalEnvError(
        "MALFORMED_KEY",
        `Invalid environment variable name in the local env file: ${JSON.stringify(key)}`,
      );
    }

    let value = line.slice(eq + 1).trim();
    const first = value[0];
    if (
      value.length >= 2 &&
      ((first === '"' && value.endsWith('"')) || (first === "'" && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }

  return out;
}

export type ResolvedLocalEnv = {
  /** Sanitized target. Safe to print: host, port and database only. */
  target: Target;
  /** The exact values that were validated. Never logged. */
  databaseUrl: string;
  directUrl: string;
};

type LocalEnvOptions = {
  /**
   * Directory the local env file is resolved against.
   *
   * There is deliberately no `file` option. Accepting a path would make this a
   * general-purpose `.env` loader — one that could be pointed at `.env` or
   * `.env.local` and reproduce the exact inheritance problem it exists to
   * prevent. The file name is fixed; only the directory varies, and `cwd`
   * exists so offline tests can use a throwaway directory.
   */
  cwd?: string;
  /** Injection point for tests. Defaults to `process.env`. */
  env?: Record<string, string | undefined>;
};

/**
 * Read the local env file and validate both connection variables.
 *
 * Every failure is a refusal. There is no fallback to `.env`, and no partial
 * success: a missing file, a missing variable, or a URL that points anywhere
 * other than the approved loopback database all stop here.
 *
 * Reads and validates exactly once, so the values returned are by construction
 * the values that were checked.
 */
export function resolveLocalEnv(opts: LocalEnvOptions = {}): ResolvedLocalEnv {
  const file = LOCAL_ENV_FILE;
  const path = resolve(opts.cwd ?? process.cwd(), file);

  if (!existsSync(path)) {
    throw new LocalEnvError(
      "MISSING_LOCAL_ENV_FILE",
      `No local env file at ${file}. This command reads only that file and never falls back to .env, ` +
        `so it will not run against production by accident. Copy ${file}.example to ${file} and set ` +
        `both DATABASE_URL and DIRECT_URL to the disposable database.`,
    );
  }

  const parsed = parseEnvFile(readFileSync(path, "utf8"));

  // An already-exported variable is accepted, because an operator who set both
  // explicitly has made a decision. What is never accepted is a file that omits
  // one of them — that is a configuration gap, not an intentional override.
  const databaseUrl = parsed.DATABASE_URL ?? opts.env?.DATABASE_URL;
  const directUrl = parsed.DIRECT_URL ?? opts.env?.DIRECT_URL;

  if (!databaseUrl || !directUrl) {
    const missing = [
      databaseUrl ? undefined : "DATABASE_URL",
      directUrl ? undefined : "DIRECT_URL",
    ].filter(Boolean);
    throw new LocalEnvError(
      "MISSING_LOCAL_VARIABLES",
      `${file} must define ${missing.join(" and ")}. The Prisma CLI prefers DIRECT_URL, so a file that ` +
        `sets only DATABASE_URL would silently connect somewhere else.`,
    );
  }

  try {
    const { databaseUrl: target } = assertScratchPair({ databaseUrl, directUrl });
    return { target, databaseUrl, directUrl };
  } catch (e) {
    if (e instanceof ScratchTargetError) {
      throw new LocalEnvError(
        e.code,
        `${file}: ${e.message} (allowed databases: ${APPROVED_SCRATCH_DATABASES.join(", ")}, ` +
          `host must be loopback, port ${SCRATCH_PORT})`,
      );
    }
    throw e;
  }
}

/** Validate the local env file and return its sanitized target. */
export function loadLocalEnv(opts: LocalEnvOptions = {}): Target {
  return resolveLocalEnv(opts).target;
}

/**
 * Load the local env file and pin both Prisma variables on `process.env`.
 *
 * Must be called before anything imports `@prisma/client`, because that import
 * loads `.env` into the environment. dotenv never overwrites an already-set key,
 * so the verified values here survive that load — which is what stops `.env`'s
 * production `DIRECT_URL` from being reintroduced behind a validated guard.
 */
export function applyLocalEnv(opts: LocalEnvOptions = {}): Target {
  const { target, databaseUrl, directUrl } = resolveLocalEnv(opts);

  process.env.DATABASE_URL = databaseUrl;
  process.env.DIRECT_URL = directUrl;

  return target;
}

/**
 * Re-validate whatever is live on `process.env` right now.
 *
 * Why this exists alongside `applyLocalEnv`
 *
 * `src/lib/security/order-success-page.test.ts` imports `PrismaClient` statically
 * and performs dozens of `deleteMany` / `create` calls. ES module imports are
 * hoisted, so that file cannot pin its environment before its own Prisma import
 * the way `seed.ts` does. Instead it calls this at the top of its module body —
 * after the import has resolved, but before `new PrismaClient()` is constructed
 * and long before any query is issued.
 *
 * Two cases:
 *
 *   - Started via `run-order-success-page.ts`: the runner called `applyLocalEnv`
 *     first, dotenv did not overwrite the pinned keys, and the values here are
 *     the approved loopback pair. Passes.
 *   - Started directly by path: `.env` was loaded by the Prisma import, so these
 *     values are production. The scratch allowlist rejects them and the run is
 *     refused before a single query.
 *
 * This verifies live state rather than trusting a token. There is nothing to
 * forge: if the effective URLs are not approved scratch URLs, the run stops.
 */
export function assertLocalEnvApplied(
  env: Record<string, string | undefined> = process.env,
): Target {
  const databaseUrl = env.DATABASE_URL;
  const directUrl = env.DIRECT_URL;

  if (!databaseUrl || !directUrl) {
    throw new LocalEnvError(
      "LOCAL_ENV_NOT_APPLIED",
      "This test requires the approved local environment, and it is not configured. " +
        "Run it through scripts/e2e/run-order-success-page.ts " +
        "(npm run e2e:order-success-page), which validates and pins DATABASE_URL and " +
        `DIRECT_URL from ${LOCAL_ENV_FILE} before this module is loaded. Do not export ` +
        "connection variables by hand and do not source an env file into the shell.",
    );
  }

  try {
    return assertScratchPair({ databaseUrl, directUrl }).databaseUrl;
  } catch (e) {
    if (e instanceof ScratchTargetError) {
      throw new LocalEnvError(
        e.code,
        "The environment currently in effect does not point at an approved scratch " +
          `database: ${e.message} Run this through ` +
          "scripts/e2e/run-order-success-page.ts instead of letting .env supply the " +
          "connection. Refusing before any query is issued.",
      );
    }
    throw e;
  }
}