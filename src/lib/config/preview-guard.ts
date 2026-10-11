/**
 * Preview-deployment isolation guard — pure core.
 *
 * WHY THIS EXISTS
 *
 * Vercel inlines environment variables per scope, and this project currently
 * shares one `DATABASE_URL`/`DIRECT_URL` value between the Preview and
 * Production scopes. A Preview deployment therefore connects to the production
 * database unless it is explicitly pointed elsewhere. This module makes that
 * fail closed at the code level: a Vercel Preview deployment refuses to
 * initialise a database client until an explicit, approved target is supplied
 * and validated.
 *
 * It is deliberately NOT a substitute for configuration isolation. A separate
 * Preview database and isolated integration credentials are still required.
 * This guard only guarantees that a misconfigured Preview cannot silently reach
 * an unapproved (e.g. production) database.
 *
 * This file is pure: it reads nothing from `process.env`, never connects, and
 * never returns or logs a connection string or credential. Callers inject the
 * values they want evaluated, which is what makes every branch testable without
 * a database. The `server-only` wrapper that reads the real environment lives in
 * `src/lib/config/deployment.ts`.
 */

/**
 * Deployment context derived from `VERCEL_ENV`.
 *
 * `local` covers everything that is not a Vercel deployment (`VERCEL_ENV`
 * unset/blank), plus Vercel's own `development` value, which is what `vercel
 * dev` sets. `unknown` is any other non-empty value: an unrecognised context
 * must not be silently treated as safe, so it fails closed exactly like Preview
 * (see `assertPreviewDatabaseTarget` and `resolveOperationsAllowed`).
 */
export type DeploymentEnvironment = "production" | "preview" | "local" | "unknown";

/** Vercel sets this to "production", "preview" or "development". */
export const VERCEL_ENV_VAR = "VERCEL_ENV";

/**
 * Comma-separated allowlist of database targets approved for the Preview
 * deployment. Each entry is `host`, `host:port`, or `host:port/database`
 * (case-insensitive). There is intentionally NO default: an empty or missing
 * value refuses all Preview database access.
 */
export const PREVIEW_DATABASE_TARGETS_ENV = "PREVIEW_DATABASE_TARGETS";

/**
 * Escape hatch for the Preview-only operation guards. Unset (the default) means
 * checkout, admin and the paid-notification cron are refused in Preview. Set to
 * "true"/"1"/"yes"/"on" only once a Preview deployment points at an isolated
 * database and isolated credentials.
 */
export const PREVIEW_OPERATIONS_ENV = "PREVIEW_DANGEROUS_OPERATIONS_ENABLED";

/** Message returned by handlers that refuse a Preview-only operation. */
export const PREVIEW_OPERATION_DISABLED_MESSAGE =
  "This operation is disabled in preview deployments.";

export type DbTarget = { host: string; port: string; database: string };

export type ApprovedTarget = {
  host: string;
  port?: string;
  database?: string;
};

export type PreviewDatabaseDecision =
  | { enforced: false }
  | { enforced: true; database: DbTarget; direct?: DbTarget };

export class PreviewGuardError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PreviewGuardError";
    this.code = code;
  }
}

/**
 * Managed-provider host fragments. Used ONLY to produce a clearer error code
 * for a host that is refused anyway — never to approve one. An approved Preview
 * database may itself be a managed host, so approval always comes from the
 * explicit allowlist, never from absence of these fragments.
 */
const MANAGED_PROVIDER_HINTS = [
  "supabase",
  "pooler",
  "neon",
  "railway",
  "fly.io",
  "onrender",
  "rds.amazonaws",
  "azure",
  "planetscale",
  "clevver",
  "elasticsql",
];

function looksManagedProvider(host: string): boolean {
  return MANAGED_PROVIDER_HINTS.some((hint) => host.includes(hint));
}

/**
 * Map `VERCEL_ENV` onto a deployment environment.
 *
 * The policy is deliberate and exhaustive:
 *   - unset or blank   → `local`  (not running on Vercel: `next dev`, tests,
 *                                   self-hosted — the established behaviour)
 *   - "development"    → `local`  (`vercel dev`)
 *   - "preview"        → `preview`
 *   - "production"     → `production`
 *   - anything else    → `unknown` (fail closed; never assumed safe)
 *
 * Only the exact tokens above are recognised. Values are trimmed and
 * lower-cased first, so `" Preview "` is still Preview.
 */
export function deploymentEnvironment(
  vercelEnv: string | undefined,
): DeploymentEnvironment {
  const value = (vercelEnv ?? "").trim().toLowerCase();
  if (value === "") return "local";
  if (value === "development") return "local";
  if (value === "preview") return "preview";
  if (value === "production") return "production";
  return "unknown";
}

/**
 * Parse a PostgreSQL connection URL into host/port/database.
 *
 * The raw value is never placed in an error message: a connection URL carries a
 * password. Only a missing, malformed, non-postgres or hostless value throws.
 */
export function parseDatabaseTarget(
  raw: string | undefined,
  label: string,
): DbTarget {
  if (raw === undefined || raw.trim() === "") {
    throw new PreviewGuardError(
      "MISSING_DATABASE_URL",
      `${label} is not set. An explicit, approved database target is required. Refusing.`,
    );
  }

  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new PreviewGuardError(
      "MALFORMED_DATABASE_URL",
      `${label} is not a valid URL. Refusing.`,
    );
  }

  const scheme = url.protocol.replace(/:$/, "").toLowerCase();
  if (scheme !== "postgresql" && scheme !== "postgres") {
    throw new PreviewGuardError(
      "BAD_DATABASE_SCHEME",
      `${label} must use a postgresql:// scheme. Refusing.`,
    );
  }

  // F1: a query string or fragment is a second, independent way to steer a
  // connection. PostgreSQL/Prisma accept parameters such as `host`, `port`,
  // `socket_path` and `database` that override the authority component, so a URL
  // whose hostname is on the allowlist can still be dialled somewhere else. The
  // host and port checks below never see them. This mirrors the migration
  // guard's `UNAPPROVED_URL_PARAMS` policy (scripts/e2e/scratch-guard.ts) and is
  // deliberately an empty-query/empty-fragment rule rather than a denylist of
  // known-bad names, because percent-encoding (`%68ost=`) hides a name from a
  // reader but not from the driver. Only parameter NAMES are named in the error,
  // never values — a value can carry a password.
  //
  // The raw string is tested too: a bare `?`/`#` parses to an empty search/hash,
  // and WHATWG parsing terminates userinfo at the first such character, so a
  // literal one is always a delimiter (a password must percent-encode it).
  if (url.search !== "" || url.hash !== "" || /[?#]/.test(raw)) {
    const names = [...url.searchParams.keys()].join(", ");
    throw new PreviewGuardError(
      "UNAPPROVED_URL_PARAMS",
      `${label} carries a query string or fragment, which this guard does not accept` +
        (names === ""
          ? ""
          : ` (parameter${names.includes(",") ? "s" : ""}: ${names})`) +
        ". Parameters such as host, port and socket_path can redirect a connection that " +
        "otherwise looks approved, and the host check below does not see them. Remove the " +
        "query string from the URL. Refusing.",
    );
  }

  // URL.hostname keeps the brackets around an IPv6 literal. Embedded
  // credentials are intentionally tolerated: the connection needs them, and
  // WHATWG parsing fixes the host after the LAST `@` in the authority, so a
  // credential cannot restructure the destination. The target model is
  // host/port/database only; credentials never take part in approval.
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "") {
    throw new PreviewGuardError(
      "NO_DATABASE_HOST",
      `${label} has no host. Refusing.`,
    );
  }

  return {
    host,
    port: url.port,
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

/**
 * Parse one `PREVIEW_DATABASE_TARGETS` entry.
 *
 * Accepted forms (hosts are matched case-insensitively; the database, when
 * present, is matched case-insensitively too):
 *   - `host`
 *   - `host:port`
 *   - `host:port/database`
 *   - `[ipv6]`, `[ipv6]:port`, `[ipv6]:port/database`
 *
 * Anything ambiguous or malformed is refused with `BAD_PREVIEW_ALLOWLIST_ENTRY`
 * rather than guessed at, because a mis-parsed entry can end up approving a
 * target nobody intended:
 *   - embedded credentials (`@`) are never part of a target
 *   - an unbracketed IPv6 literal is indistinguishable from `host:port`
 *   - a trailing `:` (empty port), a non-numeric or out-of-range port, an empty
 *     host, whitespace inside the host, and query/fragment markers
 */
function parseApprovedEntry(entry: string): ApprovedTarget {
  let rest = entry.trim();

  if (rest.includes("@")) {
    throw new PreviewGuardError(
      "BAD_PREVIEW_ALLOWLIST_ENTRY",
      `${PREVIEW_DATABASE_TARGETS_ENV} entries must not contain credentials ("@"). ` +
        `Give host, optional port and optional database only. Refusing.`,
    );
  }
  if (/[?#]/.test(rest)) {
    throw new PreviewGuardError(
      "BAD_PREVIEW_ALLOWLIST_ENTRY",
      `${PREVIEW_DATABASE_TARGETS_ENV} entries must not contain a query string or ` +
        `fragment. Refusing.`,
    );
  }

  let database: string | undefined;
  const slash = rest.indexOf("/");
  if (slash !== -1) {
    database = rest.slice(slash + 1).trim().toLowerCase() || undefined;
    rest = rest.slice(0, slash);
  }

  let host: string;
  let port: string | undefined;

  if (rest.startsWith("[")) {
    // Bracketed IPv6 literal, optionally followed by `:port`.
    const close = rest.indexOf("]");
    if (close === -1) {
      throw new PreviewGuardError(
        "BAD_PREVIEW_ALLOWLIST_ENTRY",
        `${PREVIEW_DATABASE_TARGETS_ENV} entry has an unterminated IPv6 literal. Refusing.`,
      );
    }
    host = rest.slice(1, close).trim().toLowerCase();
    const after = rest.slice(close + 1);
    if (after !== "") {
      if (!after.startsWith(":")) {
        throw new PreviewGuardError(
          "BAD_PREVIEW_ALLOWLIST_ENTRY",
          `${PREVIEW_DATABASE_TARGETS_ENV} entry has unexpected characters after an ` +
            `IPv6 literal. Refusing.`,
        );
      }
      port = after.slice(1).trim();
    }
  } else {
    // In an unbracketed entry a colon can only be a port separator, so a second
    // colon means an unbracketed IPv6 literal — ambiguous, so refuse rather than
    // silently split it as `host:port`.
    const colons = (rest.match(/:/g) ?? []).length;
    if (colons > 1) {
      throw new PreviewGuardError(
        "BAD_PREVIEW_ALLOWLIST_ENTRY",
        `${PREVIEW_DATABASE_TARGETS_ENV} entry looks like an unbracketed IPv6 ` +
          `literal; wrap IPv6 addresses in "[...]" (for example "[::1]:5432"). Refusing.`,
      );
    }
    if (colons === 1) {
      const colon = rest.indexOf(":");
      host = rest.slice(0, colon).trim().toLowerCase();
      port = rest.slice(colon + 1).trim();
    } else {
      host = rest.trim().toLowerCase();
    }
  }

  if (host === "") {
    throw new PreviewGuardError(
      "BAD_PREVIEW_ALLOWLIST_ENTRY",
      `${PREVIEW_DATABASE_TARGETS_ENV} contains an entry with no host. Refusing.`,
    );
  }
  if (/\s/.test(host)) {
    throw new PreviewGuardError(
      "BAD_PREVIEW_ALLOWLIST_ENTRY",
      `${PREVIEW_DATABASE_TARGETS_ENV} contains an entry with whitespace in the host. Refusing.`,
    );
  }
  if (port !== undefined) {
    if (!/^[0-9]+$/.test(port)) {
      throw new PreviewGuardError(
        "BAD_PREVIEW_ALLOWLIST_ENTRY",
        `${PREVIEW_DATABASE_TARGETS_ENV} contains an entry with a non-numeric or empty ` +
          `port. Refusing.`,
      );
    }
    const numeric = Number(port);
    if (numeric < 1 || numeric > 65535) {
      throw new PreviewGuardError(
        "BAD_PREVIEW_ALLOWLIST_ENTRY",
        `${PREVIEW_DATABASE_TARGETS_ENV} contains an entry with a port outside 1-65535. Refusing.`,
      );
    }
    port = String(numeric);
  }

  return { host, port: port || undefined, database };
}

/**
 * Parse the Preview allowlist. A missing or empty value is a refusal, never a
 * permissive default — the whole point is that no Preview target is assumed
 * safe.
 */
export function parsePreviewAllowlist(raw: string | undefined): ApprovedTarget[] {
  if (raw === undefined || raw.trim() === "") {
    throw new PreviewGuardError(
      "MISSING_PREVIEW_ALLOWLIST",
      `${PREVIEW_DATABASE_TARGETS_ENV} is not set. Preview database access is refused ` +
        `until an explicit approved target is supplied.`,
    );
  }

  const entries = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map(parseApprovedEntry);

  if (entries.length === 0) {
    throw new PreviewGuardError(
      "MISSING_PREVIEW_ALLOWLIST",
      `${PREVIEW_DATABASE_TARGETS_ENV} contains no usable entries. Preview database ` +
        `access is refused.`,
    );
  }

  return entries;
}

/**
 * Whether a parsed target matches any approved entry (exact, case-insensitive).
 *
 * F3 — matching granularity is intentional and documented here so it is a
 * deliberate choice rather than an accident: an entry that names a port and/or
 * database only matches a target with that exact port/database. An entry that is
 * host-only (`host`) matches the host on ANY port and ANY database. Operators who
 * want to pin the port or database must include it in the entry.
 */
export function targetApproved(
  target: DbTarget,
  allowlist: ApprovedTarget[],
): boolean {
  return allowlist.some(
    (entry) =>
      entry.host === target.host &&
      (entry.port === undefined || entry.port === target.port) &&
      (entry.database === undefined ||
        entry.database === target.database.toLowerCase()),
  );
}

function rejectTarget(label: string, target: DbTarget): PreviewGuardError {
  if (looksManagedProvider(target.host)) {
    return new PreviewGuardError(
      "PRODUCTION_DATABASE_TARGET",
      `${label} points at a managed provider host that is not on the approved ` +
        `database allowlist (${PREVIEW_DATABASE_TARGETS_ENV}). Refusing.`,
    );
  }
  return new PreviewGuardError(
    "UNAPPROVED_PREVIEW_TARGET",
    `${label} is not on the approved database allowlist (${PREVIEW_DATABASE_TARGETS_ENV}). Refusing.`,
  );
}

/**
 * The gate.
 *
 * Outside Preview and outside any unrecognised context it is a no-op, so local
 * development, tests and production initialisation are untouched. Otherwise —
 * Preview *or* an unknown `VERCEL_ENV` (F2: fail closed, never assume safe) — it
 * refuses unless BOTH the runtime target (`DATABASE_URL`) and the migration
 * target (`DIRECT_URL`, when set) are present, well-formed, and explicitly
 * approved.
 */
export function assertPreviewDatabaseTarget(input: {
  vercelEnv: string | undefined;
  databaseUrl: string | undefined;
  directUrl?: string | undefined;
  allowlist: string | undefined;
}): PreviewDatabaseDecision {
  const env = deploymentEnvironment(input.vercelEnv);
  if (env === "local" || env === "production") {
    return { enforced: false };
  }

  const database = parseDatabaseTarget(input.databaseUrl, "DATABASE_URL");
  const allowlist = parsePreviewAllowlist(input.allowlist);

  if (!targetApproved(database, allowlist)) {
    throw rejectTarget("DATABASE_URL", database);
  }

  let direct: DbTarget | undefined;
  if (input.directUrl !== undefined && input.directUrl.trim() !== "") {
    direct = parseDatabaseTarget(input.directUrl, "DIRECT_URL");
    if (!targetApproved(direct, allowlist)) {
      throw rejectTarget("DIRECT_URL", direct);
    }
  }

  return { enforced: true, database, direct };
}

/**
 * Convenience adapter that reads the guard's inputs from an environment map.
 * Takes the map as an argument rather than reaching for `process.env` so the
 * module stays pure and the server-only wrapper remains the single place that
 * touches the real environment. Prisma initialisation calls this directly so the
 * guard does not drag `server-only` into the database-client import graph.
 */
export function assertPreviewDatabaseTargetFromEnv(
  env: Record<string, string | undefined>,
): PreviewDatabaseDecision {
  return assertPreviewDatabaseTarget({
    vercelEnv: env[VERCEL_ENV_VAR],
    databaseUrl: env.DATABASE_URL,
    directUrl: env.DIRECT_URL,
    allowlist: env[PREVIEW_DATABASE_TARGETS_ENV],
  });
}

const TRUTHY = new Set(["1", "true", "yes", "on", "enabled"]);

/**
 * Whether Preview-only dangerous operations (checkout/payment initiation, admin,
 * the paid-notification cron, external service calls) are permitted.
 *
 * Outside Preview and outside any unrecognised context: always true — local
 * development and production are unaffected. In Preview, and in an unknown
 * context (F2: fail closed), this is false unless
 * `PREVIEW_DANGEROUS_OPERATIONS_ENABLED` is explicitly truthy, which is only safe
 * once the deployment has its own database and isolated credentials.
 */
export function resolveOperationsAllowed(input: {
  vercelEnv: string | undefined;
  optIn: string | undefined;
}): boolean {
  const env = deploymentEnvironment(input.vercelEnv);
  if (env === "local" || env === "production") return true;
  return TRUTHY.has((input.optIn ?? "").trim().toLowerCase());
}
