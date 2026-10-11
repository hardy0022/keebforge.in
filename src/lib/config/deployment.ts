import "server-only";

import {
  PREVIEW_OPERATIONS_ENV,
  assertPreviewDatabaseTargetFromEnv,
  deploymentEnvironment,
  resolveOperationsAllowed,
  type DeploymentEnvironment,
  type PreviewDatabaseDecision,
} from "@/lib/config/preview-guard";

export { PREVIEW_OPERATION_DISABLED_MESSAGE } from "@/lib/config/preview-guard";

/**
 * Server-only deployment-environment helper.
 *
 * Reads the real environment and delegates all decisions to the pure core in
 * `preview-guard.ts`. `server-only` keeps it out of client bundles; it must only
 * ever be imported by server code (Prisma initialisation, route handlers,
 * server-side authorization).
 *
 * NOTE: this is a code-level fail-closed guard, not configuration isolation. A
 * separate Preview database and isolated integration credentials are still
 * required — see the guard's tests and the project production docs.
 */

/** Which deployment this process is running in, per `VERCEL_ENV`. */
export function currentDeploymentEnvironment(): DeploymentEnvironment {
  return deploymentEnvironment(process.env.VERCEL_ENV);
}

export function isPreviewDeployment(): boolean {
  return currentDeploymentEnvironment() === "preview";
}

/**
 * Fail-closed Preview database gate. Call this before constructing a database
 * client. Outside Preview it returns `{ enforced: false }` and does nothing.
 * In Preview it throws `PreviewGuardError` unless the configured target is
 * explicitly approved.
 */
export function assertDeploymentDatabaseConfig(): PreviewDatabaseDecision {
  return assertPreviewDatabaseTargetFromEnv(process.env);
}

/**
 * Whether Preview-only dangerous operations are permitted. True outside
 * Preview; in Preview only with an explicit opt-in.
 */
export function previewOperationsAllowed(): boolean {
  return resolveOperationsAllowed({
    vercelEnv: process.env.VERCEL_ENV,
    optIn: process.env[PREVIEW_OPERATIONS_ENV],
  });
}
