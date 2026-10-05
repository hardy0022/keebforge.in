import { NextResponse } from "next/server";

/**
 * Fixed-window rate limiter for the payment endpoints.
 *
 * No Redis/Upslash dependency: the threat being bounded is a single script
 * hammering one endpoint, and a per-instance in-process counter stops that on
 * every instance it lands on. The honest limit of this design is that each
 * serverless instance keeps its own counters, so a distributed flood is bounded
 * per instance rather than globally; swapping the storage below for a shared one
 * is the only change needed to make it global.
 *
 * What it must NOT break:
 *  - guest checkout and the authenticated path (limits are keyed per client, and
 *    are generous enough for a human retrying a card);
 *  - legitimate Razorpay retries. The webhook is deliberately NOT limited — a
 *    dropped delivery is a lost payment record, and Razorpay's own retry
 *    schedule is the authority there. Only the two customer-facing endpoints
 *    that create work are.
 *
 * (No `import "server-only"` here because that specifier is a Next-internal
 * alias that cannot be resolved by the tsx check script — same reason as
 * src/lib/shipping/pickup-config.ts. Nothing here reads a secret; the module is
 * inert if it were ever bundled client-side.)
 */

export type RateLimitDecision = {
  /** Whether the request may proceed. */
  allowed: boolean;
  /** Requests permitted per window. */
  limit: number;
  /** Requests left in the current window. */
  remaining: number;
  /** Seconds until the window resets; 0 when allowed. */
  retryAfterSeconds: number;
};

type Bucket = { count: number; resetAt: number };

/**
 * Stored on globalThis so the counters survive the dev server's module reloads;
 * without it every edit would hand an attacker a fresh budget.
 */
const store = (() => {
  const g = globalThis as unknown as { __kfRateLimits?: Map<string, Bucket> };
  g.__kfRateLimits ??= new Map<string, Bucket>();
  return g.__kfRateLimits;
})();

/** Bounds memory when a flood uses many distinct keys. */
const MAX_KEYS = 10_000;

function sweep(now: number): void {
  if (store.size <= MAX_KEYS) return;
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key);
  }
}

/**
 * Count one request against `key` and report whether it is allowed.
 *
 * Fixed window: cheap, and the only property that matters here is that a burst
 * is bounded. `now` is injectable so the tests can advance time instead of
 * sleeping.
 */
export function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number; now?: number },
): RateLimitDecision {
  const now = opts.now ?? Date.now();
  sweep(now);

  const existing = store.get(key);
  if (!existing || existing.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + opts.windowMs });
    return {
      allowed: true,
      limit: opts.limit,
      remaining: opts.limit - 1,
      retryAfterSeconds: 0,
    };
  }

  existing.count += 1;
  const allowed = existing.count <= opts.limit;
  return {
    allowed,
    limit: opts.limit,
    remaining: Math.max(0, opts.limit - existing.count),
    retryAfterSeconds: allowed
      ? 0
      : Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

/** Clears every counter. Tests only. */
export function resetRateLimits(): void {
  store.clear();
}

/**
 * Best-effort client identity.
 *
 * `x-forwarded-for` is set by the platform edge and holds a comma-separated
 * chain, left-most first, so that is the entry that identifies the caller.
 * Everything shares one bucket when the header is absent, which is the safe
 * direction to fail in.
 */
export function clientIp(req: {
  headers: Headers;
}): string {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** 429 with the standard headers, so a client can tell "slow down" from "broken". */
export function rateLimitResponse(
  decision: RateLimitDecision,
  scope: string,
): NextResponse {
  return NextResponse.json(
    {
      error:
        "Too many requests. Please wait a moment before trying again.",
      scope,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, decision.retryAfterSeconds)),
        "X-RateLimit-Limit": String(decision.limit),
        "X-RateLimit-Remaining": String(decision.remaining),
      },
    },
  );
}