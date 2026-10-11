import crypto from "node:crypto";
import {
  SCHEDULED_RECONCILE_HARD_MAX,
  type ScheduledReconcileReport,
} from "@/lib/notifications/paid-confirmation";

/**
 * Pure, dependency-free helpers for the scheduled reconciliation route.
 *
 * Kept separate from the route so authorization, cutoff validation and the
 * per-run cap can be exercised without a database, a network, or `server-only`.
 * Nothing here sends, connects to a provider, or logs secret material.
 */

export { SCHEDULED_RECONCILE_HARD_MAX };

/** Env var carrying the shared secret Vercel Cron presents as a Bearer token. */
export const CRON_SECRET_ENV = "CRON_SECRET";
/** ISO 8601 instant; only orders created on/after it may be auto-queued. */
export const RECONCILE_SINCE_ENV = "PAID_NOTIFICATION_RECONCILE_SINCE";
/** Optional per-run cap; clamped to the hard maximum regardless of value. */
export const RECONCILE_LIMIT_ENV = "PAID_NOTIFICATION_RECONCILE_LIMIT";

export type CronAuthResult = "ok" | "missing-config" | "denied";

/**
 * Verify the `Authorization` header against the configured secret.
 *
 * Fails closed: an unset secret is a configuration error (the caller must not
 * run), and any mismatch — including a length mismatch — is denied. The
 * comparison is constant-time once the byte lengths match, so it does not leak
 * how many leading bytes were correct. Never returns or logs either value.
 */
export function authorizeCronRequest(
  authorizationHeader: string | null,
  secret: string | undefined | null,
): CronAuthResult {
  if (!secret) return "missing-config";
  const provided = Buffer.from(authorizationHeader ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  if (provided.length !== expected.length) return "denied";
  return crypto.timingSafeEqual(provided, expected) ? "ok" : "denied";
}

const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse the required cutoff. Returns null for a missing, blank or
 * non-ISO-8601 value, so the caller can fail closed *before* scanning or
 * queueing anything. A date-only string ("2026-10-10") is rejected: the cutoff
 * must be an unambiguous instant.
 */
export function parseReconcileCutoff(
  value: string | undefined | null,
): Date | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ISO_TIMESTAMP.test(trimmed)) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Resolve the effective per-run cap: the smaller of the requested value and the
 * hard maximum. A missing, non-numeric or non-positive value yields the hard
 * maximum. A value above the maximum is clamped, never honoured.
 */
export function resolveReconcileLimit(value: string | undefined | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return SCHEDULED_RECONCILE_HARD_MAX;
  return Math.min(Math.floor(parsed), SCHEDULED_RECONCILE_HARD_MAX);
}

/** HTTP-shaped outcome the route maps onto a `NextResponse`. */
export type ScheduledReconcileOutcome =
  | { status: 401; body: { error: string } }
  | { status: 500; body: { error: string } }
  | { status: 200; body: ScheduledReconcileReport };

/**
 * Everything the run needs, injected so the whole decision can be exercised
 * without a database, a network or `server-only`. `queueMissing` is the only
 * side effect; there is deliberately no `send` dependency, so this path cannot
 * deliver an email even if it wanted to.
 */
export type ScheduledReconcileDeps = {
  env: Record<string, string | undefined>;
  queueMissing: (input: {
    since: Date;
    max: number;
  }) => Promise<ScheduledReconcileReport>;
  log?: (message: string) => void;
  error?: (message: string) => void;
};

/**
 * Authorize, validate and run one bounded reconciliation pass.
 *
 * Pure with respect to its dependencies: it reads configuration from the
 * injected `env`, calls only `queueMissing`, and returns an HTTP-shaped result
 * instead of touching `next/server`. Fails closed before any scan when the
 * secret is unset or the bearer token is wrong, and before any queue when the
 * cutoff is missing or malformed. Never logs the secret or the header.
 */
export async function runScheduledReconcile(
  authorizationHeader: string | null,
  deps: ScheduledReconcileDeps,
): Promise<ScheduledReconcileOutcome> {
  const { env } = deps;
  const auth = authorizeCronRequest(authorizationHeader, env[CRON_SECRET_ENV]);
  if (auth === "missing-config") {
    (deps.error ?? (() => {}))(
      `[cron:reconcile-paid-notifications] ${CRON_SECRET_ENV} is not configured; refusing to run`,
    );
    return { status: 500, body: { error: "Reconciliation is not configured." } };
  }
  if (auth === "denied") {
    return { status: 401, body: { error: "Unauthorized." } };
  }

  const since = parseReconcileCutoff(env[RECONCILE_SINCE_ENV]);
  if (!since) {
    (deps.error ?? (() => {}))(
      `[cron:reconcile-paid-notifications] ${RECONCILE_SINCE_ENV} is missing or not a valid ISO timestamp; refusing to run`,
    );
    return { status: 500, body: { error: "Reconciliation cutoff is not configured." } };
  }

  const max = resolveReconcileLimit(env[RECONCILE_LIMIT_ENV]);

  try {
    const report = await deps.queueMissing({ since, max });
    // Structured, non-sensitive: counts and the cap only.
    (deps.log ?? (() => {}))(
      `[cron:reconcile-paid-notifications] queued=${report.queued} scanned=${report.scanned} skipped=${report.skipped} batches=${report.batches} capped=${report.capped} max=${max} cutoff=${since.toISOString()}`,
    );
    return { status: 200, body: report };
  } catch (error) {
    (deps.error ?? (() => {}))(
      `[cron:reconcile-paid-notifications] failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
    return { status: 500, body: { error: "Reconciliation failed." } };
  }
}
