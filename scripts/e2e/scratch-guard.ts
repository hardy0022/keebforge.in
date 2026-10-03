/**
 * Scratch-database target guard.
 *
 * WHY THIS EXISTS
 *
 * On 2026-10-02 a `prisma migrate deploy` intended for the disposable container
 * applied two migrations to production instead. The mechanism:
 *
 *   prisma/schema.prisma
 *     datasource db {
 *       url       = env("DATABASE_URL")
 *       directUrl = env("DIRECT_URL")   <-- the CLI prefers this for migrations
 *     }
 *
 * The command overrode `DATABASE_URL` only. `DIRECT_URL` was unset, so Prisma
 * auto-loaded it from `.env`, which points at the production Supabase direct
 * endpoint. The Prisma CLI connected there while `dbcheck.mjs` — which uses
 * `PrismaClient` and therefore honours `url` only — correctly reported the
 * scratch database. The pre-flight check passed and the command still went to
 * production, because the check and the command used different connection paths.
 *
 * Two rules follow, and this module exists to enforce them:
 *
 *   1. Never trust a single-variable override. BOTH `DATABASE_URL` and
 *      `DIRECT_URL` must be proven to point at the same disposable local target.
 *   2. A safety check must fail closed. Every ambiguity is a refusal, never a
 *      warning — a missing variable, a missing port, an unlisted database name
 *      and a production-looking name all stop the run.
 *
 * This module is pure. It never connects to anything, and it never returns or
 * logs a credential: callers get host, port and database name only.
 */

/** The only hosts that may be targeted. Loopback literals only. */
export const SCRATCH_HOSTS: readonly string[] = ["localhost", "127.0.0.1", "::1"];

/** The host port of the disposable `kf-e2e-pg` container. */
export const SCRATCH_PORT = 55432;

/**
 * The explicit, reviewed allowlist of disposable database names.
 *
 * Deliberately short. `keebforge_e2e` is the primary scratch database;
 * `keebforge_e2e_fresh` exists to validate a from-empty build without
 * destroying the primary scratch state. Nothing else is approved — an
 * unlisted name is a refusal, not a prompt.
 */
export const APPROVED_SCRATCH_DATABASES: readonly string[] = [
  "keebforge_e2e",
  "keebforge_e2e_fresh",
];

export type Target = {
  host: string;
  port: string;
  database: string;
};

export class ScratchTargetError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ScratchTargetError";
    this.code = code;
  }
}

/**
 * Credentials never leave this module. Only these three fields are safe to
 * print, log or assert on.
 */
export function describeTarget(t: Target): Target {
  return { host: t.host, port: t.port, database: t.database };
}

/** Host patterns that indicate a managed production instance, for clearer errors. */
const PROVIDER_HOST_HINTS = [
  "supabase",
  "pooler",
  "neon",
  "railway",
  "fly.io",
  "onrender",
  "rds.amazonaws",
  "azure",
  "elasticsql",
  "clevver",
  "planetscale",
  "xethub",
];

/** Database names that must never be treated as disposable. */
const PRODUCTION_NAME_HINTS = [
  "prod",
  "production",
  "live",
  "staging",
  "stage",
  "master",
  "main",
  "primary",
  // `postgres` is the default database, and it is the exact database the
  // 2026-10-02 incident wrote to. An unlisted name is refused regardless, but
  // flagging it by name produces a far clearer message than "unapproved".
  "postgres",
];

/**
 * Name looks like a real environment. Checked *in addition to* the allowlist so
 * that adding a production name to the allowlist is still caught.
 */
export function looksProductionLike(name: string): boolean {
  const n = name.toLowerCase();
  return PRODUCTION_NAME_HINTS.some((hint) => n.includes(hint));
}

/**
 * Parse a PostgreSQL connection URL into host/port/database.
 *
 * The raw value is never included in any error message, because a connection
 * URL carries a password.
 */
export function parseConnectionString(raw: string | undefined, label: string): Target {
  if (raw === undefined || raw === null || raw.trim() === "") {
    throw new ScratchTargetError(
      "MISSING_URL",
      `${label} is not set. Both DATABASE_URL and DIRECT_URL must be provided explicitly; ` +
        `refusing to fall back to .env.`,
    );
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ScratchTargetError("MALFORMED_URL", `${label} is not a valid URL`);
  }

  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "postgresql" && scheme !== "postgres") {
    throw new ScratchTargetError("BAD_SCHEME", `${label} must use a postgresql:// scheme`);
  }

  // URL.hostname keeps the brackets around an IPv6 literal.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));

  return { host, port: url.port, database };
}

/** Validate one parsed target against the disposable-database rules. */
export function assertScratchTarget(t: Target, label: string): void {
  if (t.host === "") {
    throw new ScratchTargetError("NO_HOST", `${label} has no host`);
  }

  if (!SCRATCH_HOSTS.includes(t.host)) {
    const provider = PROVIDER_HOST_HINTS.find((hint) => t.host.includes(hint));
    throw new ScratchTargetError(
      provider ? "PROVIDER_HOST" : "REMOTE_HOST",
      provider
        ? `${label} points at a managed provider host. Refusing: only loopback scratch targets are permitted`
        : `${label} points at a remote host. Refusing: only ${SCRATCH_HOSTS.join(", ")} are permitted`,
    );
  }

  // A URL with no explicit port defaults to 5432, which is never the scratch
  // port. Absent and wrong are treated identically — both are a refusal.
  if (t.port === "") {
    throw new ScratchTargetError(
      "NO_PORT",
      `${label} has no explicit port. Refusing: the scratch port ${SCRATCH_PORT} must be stated explicitly`,
    );
  }
  if (t.port !== String(SCRATCH_PORT)) {
    throw new ScratchTargetError(
      "WRONG_PORT",
      `${label} uses port ${t.port}. Refusing: only port ${SCRATCH_PORT} is permitted`,
    );
  }

  if (t.database === "") {
    throw new ScratchTargetError("NO_DATABASE", `${label} has no database name`);
  }

  if (looksProductionLike(t.database)) {
    throw new ScratchTargetError(
      "PRODUCTION_DATABASE_NAME",
      `${label} names database "${t.database}", which looks like a real environment. Refusing`,
    );
  }

  if (!APPROVED_SCRATCH_DATABASES.includes(t.database)) {
    throw new ScratchTargetError(
      "UNAPPROVED_DATABASE",
      `${label} names database "${t.database}", which is not on the approved scratch allowlist ` +
        `(${APPROVED_SCRATCH_DATABASES.join(", ")}). Refusing`,
    );
  }
}

/**
 * The gate. Both variables must be present and must describe the same
 * disposable database. Returns the two sanitized targets on success and throws
 * `ScratchTargetError` on the first violation otherwise.
 */
export function assertScratchPair(opts: {
  databaseUrl: string | undefined;
  directUrl: string | undefined;
}): { databaseUrl: Target; directUrl: Target } {
  const db = parseConnectionString(opts.databaseUrl, "DATABASE_URL");
  const direct = parseConnectionString(opts.directUrl, "DIRECT_URL");

  assertScratchTarget(db, "DATABASE_URL");
  assertScratchTarget(direct, "DIRECT_URL");

  // `localhost` and `127.0.0.1` are the same host, so only the database and
  // port must agree. A mismatch means one connection path goes somewhere the
  // other does not — exactly the failure this module was written to catch.
  if (db.port !== direct.port || db.database !== direct.database) {
    throw new ScratchTargetError(
      "DIRECT_URL_MISMATCH",
      "DATABASE_URL and DIRECT_URL disagree. " +
        `DATABASE_URL selects ${db.database} on port ${db.port}; ` +
        `DIRECT_URL selects ${direct.database} on port ${direct.port}. ` +
        `Refusing: the Prisma CLI prefers DIRECT_URL, so a mismatch silently redirects migrations.`,
    );
  }

  return { databaseUrl: describeTarget(db), directUrl: describeTarget(direct) };
}