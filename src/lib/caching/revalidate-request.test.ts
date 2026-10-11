import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  REVALIDATE_PRODUCTION_URL_ENV,
  REVALIDATE_SECRET_ENV,
  REVALIDATE_TAGS,
  authorizeRevalidateRequest,
  parseRevalidateRequest,
} from "@/lib/caching/revalidate-request";

/**
 * On-demand revalidation (cross-deployment cache invalidation).
 *
 * Pins the security and shape guarantees of the revalidate path:
 *  1. Authorization fails closed and compares in constant time.
 *  2. Only allow-listed tags and absolute paths are accepted; empty is rejected.
 *  3. The route uses revalidateTag/revalidatePath (not updateTag) and the forward
 *     helper is a best-effort no-op unless production is explicitly configured.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const REPO = path.resolve(import.meta.dirname, "..", "..", "..");
const ROUTE = path.join(REPO, "src/app/api/revalidate/route.ts");
const EXTERNAL = path.join(REPO, "src/lib/caching/external-revalidate.ts");
const CACHE = path.join(REPO, "src/lib/caching/cache.ts");

void (async () => {
  // ── Authorization ──────────────────────────────────────────────────────────

  {
    assert.equal(authorizeRevalidateRequest(null, undefined), "missing-config");
    assert.equal(authorizeRevalidateRequest("Bearer anything", ""), "missing-config");
    assert.equal(authorizeRevalidateRequest(null, "secret"), "denied");
    assert.equal(
      authorizeRevalidateRequest("Bearer 123456", "secret"),
      "denied",
      "equal-length wrong secret is denied",
    );
    assert.equal(
      authorizeRevalidateRequest("Bearer short", "a-much-longer-secret"),
      "denied",
      "length mismatch is denied without comparing",
    );
    assert.equal(
      authorizeRevalidateRequest("bearer secret", "secret"),
      "denied",
      "scheme is case-sensitive",
    );
    assert.equal(authorizeRevalidateRequest("Bearer secret", "secret"), "ok");
    pass("revalidate authorization fails closed and denies any mismatch");
  }

  // ── Request validation ─────────────────────────────────────────────────────

  {
    for (const bad of [null, undefined, 42, "work", [], ["work"]]) {
      const out = parseRevalidateRequest(bad);
      assert.equal(out.ok, false, `reject ${JSON.stringify(bad) ?? String(bad)}`);
    }
    pass("non-object bodies are rejected");
  }

  {
    assert.equal(parseRevalidateRequest({}).ok, false);
    assert.equal(parseRevalidateRequest({ tags: [] }).ok, false);
    assert.equal(parseRevalidateRequest({ paths: [] }).ok, false);
    assert.equal(parseRevalidateRequest({ tags: [], paths: [] }).ok, false);
    pass("a request with no tags and no paths is rejected");
  }

  {
    assert.equal(parseRevalidateRequest({ tags: "work" }).ok, false);
    assert.equal(parseRevalidateRequest({ tags: [1, 2] }).ok, false);
    const unknown = parseRevalidateRequest({ tags: ["work", "secret-stuff"] });
    assert.equal(unknown.ok, false);
    assert.ok(
      !unknown.ok && unknown.error.includes("secret-stuff"),
      "unknown tag is named in the error",
    );
    pass("tags must be an allow-listed array of strings");
  }

  {
    assert.equal(parseRevalidateRequest({ paths: ["/work"] }).ok, true);
    assert.equal(parseRevalidateRequest({ paths: "work" }).ok, false);
    assert.equal(parseRevalidateRequest({ paths: [123] }).ok, false);
    assert.equal(parseRevalidateRequest({ paths: ["work"] }).ok, false);
    assert.equal(parseRevalidateRequest({ paths: ["https://evil.test"] }).ok, false);
    pass("paths must be an array of absolute strings");
  }

  {
    const out = parseRevalidateRequest({
      tags: ["work", "work", "reviews"],
      paths: ["/work", "/work"],
      ignored: "yes",
    });
    assert.equal(out.ok, true);
    assert.deepEqual(out.ok ? out.tags : null, ["work", "reviews"]);
    assert.deepEqual(out.ok ? out.paths : null, ["/work"]);
    pass("duplicates are dropped and extra keys ignored");
  }

  // ── Allow-list is coherent ────────────────────────────────────────────────

  {
    for (const tag of REVALIDATE_TAGS) {
      const out = parseRevalidateRequest({ tags: [tag] });
      assert.equal(out.ok, true, `allow-listed tag accepted: ${tag}`);
    }
    assert.equal(new Set(REVALIDATE_TAGS).size, REVALIDATE_TAGS.length);
    pass("every exported tag is accepted and the list is unique");
  }

  // ── Route + helper wiring (source pins) ───────────────────────────────────

  {
    assert.ok(fs.existsSync(ROUTE), "the revalidate route must exist");
    const route = fs.readFileSync(ROUTE, "utf8");
    for (const needle of [
      "revalidateTag",
      "revalidatePath",
      'export const dynamic = "force-dynamic"',
      'request.headers.get("authorization")',
      "authorizeRevalidateRequest",
      REVALIDATE_SECRET_ENV,
    ]) {
      assert.ok(route.includes(needle), `route must include ${needle}`);
    }
    assert.ok(
      !route.includes("updateTag"),
      "a route handler must not use updateTag (server-actions only)",
    );
    pass("the route authorizes, then revalidates tags/paths");
  }

  {
    assert.ok(fs.existsSync(EXTERNAL), "the forward helper must exist");
    const ext = fs.readFileSync(EXTERNAL, "utf8");
    for (const needle of [
      REVALIDATE_PRODUCTION_URL_ENV,
      REVALIDATE_SECRET_ENV,
      'process.env.VERCEL_ENV === "production"',
      "AbortSignal.timeout",
      "catch",
      "/api/revalidate",
    ]) {
      assert.ok(ext.includes(needle), `forward helper must include ${needle}`);
    }
    pass("the forward helper is opt-in, production-skipped and best-effort");
  }

  {
    const cache = fs.readFileSync(CACHE, "utf8");
    assert.ok(
      cache.includes("notifyExternalRevalidation"),
      "cache invalidations must forward to the external deployment",
    );
    pass("cache invalidation helpers forward the tags");
  }

  console.log(`\n${n} checks passed.`);
})();
