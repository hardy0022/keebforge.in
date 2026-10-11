import crypto from "node:crypto";

/**
 * Pure helpers for the on-demand cache revalidation route.
 *
 * Kept separate from the route so authorization and request validation can be
 * exercised without a server, a network or `server-only`. Nothing here touches
 * Next's cache: the route maps a validated result onto `revalidateTag` /
 * `revalidatePath`. Neither the secret nor the Authorization header is logged.
 */

/** Env var carrying the shared secret the caller presents as a Bearer token. */
export const REVALIDATE_SECRET_ENV = "REVALIDATE_SECRET";

/**
 * Optional base URL of the production deployment. When set (on localhost and
 * Preview — never on production itself) the cache-invalidation helpers also
 * purge that URL through `/api/revalidate`. Preview and production share one
 * database, so without it an edit made on one deployment is masked by another
 * deployment's stale data cache until its TTL expires.
 */
export const REVALIDATE_PRODUCTION_URL_ENV = "REVALIDATE_PRODUCTION_URL";

/**
 * Tags that may be purged remotely. Mirrors `TAG` in `cache.ts`; an allow-list
 * so a leaked or misconfigured caller still cannot flush arbitrary entries.
 */
export const REVALIDATE_TAGS = [
  "products",
  "categories",
  "brands",
  "services",
  "work",
  "reviews",
  "site-settings",
] as const;
const REVALIDATE_TAG_SET = new Set<string>(REVALIDATE_TAGS);

export type BearerAuthResult = "ok" | "missing-config" | "denied";

/**
 * Verify `Authorization: Bearer <secret>` in constant time.
 *
 * Fails closed: an unset secret is a configuration error the caller must not run
 * on, a length mismatch is denied before comparing, and equal-length values are
 * compared without leaking how many leading bytes matched. Never returns or logs
 * either value.
 */
export function authorizeRevalidateRequest(
  authorizationHeader: string | null,
  secret: string | undefined | null,
): BearerAuthResult {
  if (!secret) return "missing-config";
  const provided = Buffer.from(authorizationHeader ?? "", "utf8");
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  if (provided.length !== expected.length) return "denied";
  return crypto.timingSafeEqual(provided, expected) ? "ok" : "denied";
}

export type ParsedRevalidateRequest =
  | { ok: true; tags: string[]; paths: string[] }
  | { ok: false; error: string };

/**
 * Validate a decoded JSON payload shaped `{ tags?: string[], paths?: string[] }`.
 * Tags must be on the allow-list; paths must be absolute ("/..."). At least one
 * tag or path is required. Duplicates are dropped, unknown extra keys ignored.
 */
export function parseRevalidateRequest(
  payload: unknown,
): ParsedRevalidateRequest {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { ok: false, error: "Body must be a JSON object." };
  }
  const { tags, paths } = payload as { tags?: unknown; paths?: unknown };

  const outTags: string[] = [];
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.some((t) => typeof t !== "string"))
      return { ok: false, error: "`tags` must be an array of strings." };
    for (const tag of tags as string[]) {
      if (!REVALIDATE_TAG_SET.has(tag))
        return { ok: false, error: `Unknown tag: ${tag}` };
      if (!outTags.includes(tag)) outTags.push(tag);
    }
  }

  const outPaths: string[] = [];
  if (paths !== undefined) {
    if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string"))
      return { ok: false, error: "`paths` must be an array of strings." };
    for (const p of paths as string[]) {
      if (!p.startsWith("/"))
        return { ok: false, error: `Path must start with "/": ${p}` };
      if (!outPaths.includes(p)) outPaths.push(p);
    }
  }

  if (outTags.length === 0 && outPaths.length === 0)
    return { ok: false, error: "Provide at least one tag or path." };

  return { ok: true, tags: outTags, paths: outPaths };
}
