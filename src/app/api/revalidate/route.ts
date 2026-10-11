import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  authorizeRevalidateRequest,
  parseRevalidateRequest,
  REVALIDATE_SECRET_ENV,
} from "@/lib/caching/revalidate-request";

export const dynamic = "force-dynamic";

/**
 * On-demand cache revalidation.
 *
 * POST `{ tags?: string[], paths?: string[] }` with `Authorization: Bearer
 * $REVALIDATE_SECRET`. Purges the named Next.js data-cache tags and route paths
 * on THIS deployment. It exists because Preview and Production share one
 * database: an admin edit made on another deployment (e.g. localhost) cannot
 * purge this deployment's cache, so its invalidation helpers forward the tags
 * here via `REVALIDATE_PRODUCTION_URL`.
 *
 * Fails closed when the secret is unset (500) or the bearer token is wrong
 * (401); unknown tags or malformed bodies are rejected (400). Route Handlers
 * can only use `revalidateTag` (the immediate tag purge is server-action-only),
 * so `revalidateTag(tag, "max")` is used. Neither the secret nor the header is
 * ever logged.
 */
export async function POST(request: NextRequest) {
  const auth = authorizeRevalidateRequest(
    request.headers.get("authorization"),
    process.env[REVALIDATE_SECRET_ENV],
  );
  if (auth === "missing-config") {
    console.error(
      `[api/revalidate] ${REVALIDATE_SECRET_ENV} is not configured; refusing to revalidate`,
    );
    return NextResponse.json(
      { error: "Revalidation is not configured." },
      { status: 500 },
    );
  }
  if (auth === "denied") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = parseRevalidateRequest(payload);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  for (const tag of parsed.tags) revalidateTag(tag, "max");
  for (const p of parsed.paths) revalidatePath(p);

  return NextResponse.json({
    revalidated: true,
    tags: parsed.tags,
    paths: parsed.paths,
    now: Date.now(),
  });
}
