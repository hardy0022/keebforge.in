import "server-only";
import {
  REVALIDATE_PRODUCTION_URL_ENV,
  REVALIDATE_SECRET_ENV,
  REVALIDATE_TAGS,
} from "@/lib/caching/revalidate-request";

const ALLOWED = new Set<string>(REVALIDATE_TAGS);

/**
 * Ask another deployment (typically production) to purge the same tags this
 * deployment just purged.
 *
 * Preview and production share one database, so an admin edit made on localhost
 * or a Preview URL invalidates only that deployment's Next.js data cache — the
 * production cache keeps serving the pre-edit list until its TTL elapses. When
 * `REVALIDATE_PRODUCTION_URL` and `REVALIDATE_SECRET` are configured (locally /
 * in Preview), this forwards the invalidation to production's `/api/revalidate`.
 *
 * No-op unless both vars are set, and skipped on production itself so it never
 * calls back into the same deployment (its own `updateTag` already purged the
 * matching entry). Best-effort: bounded by a timeout and never throws, so a
 * network failure can never break the admin save that triggered it.
 */
export async function notifyExternalRevalidation(tags: string[]): Promise<void> {
  const base = process.env[REVALIDATE_PRODUCTION_URL_ENV]?.trim().replace(/\/+$/, "");
  const secret = process.env[REVALIDATE_SECRET_ENV];
  if (!base || !secret) return;
  if (process.env.VERCEL_ENV === "production") return;

  const safeTags = Array.from(new Set(tags.filter((t) => ALLOWED.has(t))));
  if (safeTags.length === 0) return;

  try {
    const res = await fetch(`${base}/api/revalidate`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ tags: safeTags }),
      signal: AbortSignal.timeout(2500),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(
        `[cache] external revalidation of ${base} failed: HTTP ${res.status}`,
      );
    }
  } catch (error) {
    console.error(
      `[cache] external revalidation of ${base} failed: ${
        error instanceof Error ? error.name : "unknown"
      }`,
    );
  }
}
