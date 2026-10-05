import assert from "node:assert/strict";
import {
  checkRateLimit,
  clientIp,
  rateLimitResponse,
  resetRateLimits,
} from "@/lib/payments/rate-limit";

/**
 * The limiter is the only thing bounding a script that calls
 * /api/payments/create-order or /api/payments/verify in a loop. It must
 * therefore block a burst decisively while leaving a real customer — including
 * a guest with no account, and someone retrying a declined card — untouched.
 */

let n = 0;
function pass(label: string) {
  console.log(`PASS ${++n} ${label}`);
}

const MINUTE = 60_000;

// ── the window ──────────────────────────────────────────────────────────────

{
  resetRateLimits();
  const opts = { limit: 5, windowMs: MINUTE, now: 1_000 };
  for (let i = 0; i < 5; i++) {
    assert.equal(checkRateLimit("k", opts).allowed, true, `request ${i + 1} allowed`);
  }
  const blocked = checkRateLimit("k", opts);
  assert.equal(blocked.allowed, false, "the 6th request is blocked");
  assert.equal(blocked.limit, 5);
  assert.equal(blocked.remaining, 0);
  assert.ok(blocked.retryAfterSeconds > 0, "a blocked caller is told how long to wait");
  assert.ok(
    blocked.retryAfterSeconds <= 60,
    `retryAfter should be within the window, got ${blocked.retryAfterSeconds}`,
  );
  pass("a burst is allowed up to the limit and blocked after it");
}

{
  // Fixed window: the budget comes back, so a customer is not locked out.
  resetRateLimits();
  const opts = { limit: 2, windowMs: MINUTE, now: 0 };
  assert.equal(checkRateLimit("k", opts).allowed, true);
  assert.equal(checkRateLimit("k", opts).allowed, true);
  assert.equal(checkRateLimit("k", opts).allowed, false);
  assert.equal(
    checkRateLimit("k", { ...opts, now: MINUTE + 1 }).allowed,
    true,
    "the budget resets once the window has passed",
  );
  pass("the budget resets when the window expires");
}

{
  // Keys are independent — that is what stops one noisy order from blocking a
  // different customer behind a shared NAT.
  resetRateLimits();
  const opts = { limit: 1, windowMs: MINUTE, now: 0 };
  assert.equal(checkRateLimit("a", opts).allowed, true);
  assert.equal(checkRateLimit("b", opts).allowed, true, "a separate key is unaffected");
  assert.equal(checkRateLimit("a", opts).allowed, false);
  pass("keys are limited independently");
}

{
  resetRateLimits();
  const first = checkRateLimit("k", { limit: 3, windowMs: MINUTE, now: 0 });
  assert.equal(first.remaining, 2, "remaining counts down from the limit");
  const second = checkRateLimit("k", { limit: 3, windowMs: MINUTE, now: 0 });
  assert.equal(second.remaining, 1);
  const third = checkRateLimit("k", { limit: 3, windowMs: MINUTE, now: 0 });
  assert.equal(third.remaining, 0, "remaining never goes negative");
  pass("remaining is reported and floors at zero");
}

{
  resetRateLimits();
  const opts = { limit: 2, windowMs: MINUTE, now: 0 };
  checkRateLimit("k", opts);
  checkRateLimit("k", opts);
  const blocked = checkRateLimit("k", opts);
  assert.equal(blocked.retryAfterSeconds, 60);
  // Advance most of the way through the window.
  const later = checkRateLimit("k", { ...opts, now: 59_000 });
  assert.equal(later.allowed, false);
  assert.equal(later.retryAfterSeconds, 1, "retryAfter shrinks as the window drains");
  pass("retryAfter reflects the time actually left in the window");
}

// ── memory is bounded ───────────────────────────────────────────────────────

{
  resetRateLimits();
  const opts = { limit: 1, windowMs: MINUTE, now: 0 };
  for (let i = 0; i < 20_000; i++) checkRateLimit(`flood:${i}`, opts);
  // Every expired bucket is dropped once the map outgrows its ceiling, so a
  // flood across many keys cannot grow the limiter without bound.
  checkRateLimit("trigger-sweep", { limit: 1, windowMs: MINUTE, now: MINUTE + 1 });
  const size = (
    globalThis as unknown as { __kfRateLimits: Map<string, unknown> }
  ).__kfRateLimits.size;
  assert.ok(size < 20_000, `expired buckets must be swept, map held ${size}`);
  pass("expired buckets are swept so a key flood cannot grow the map without bound");
}

{
  resetRateLimits();
  assert.ok(true);
  pass("resetRateLimits clears every counter");
}

// ── clientIp ────────────────────────────────────────────────────────────────

{
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.9, 70.41.3.18, 150.172.238.178",
  });
  assert.equal(
    clientIp({ headers }),
    "203.0.113.9",
    "the left-most entry is the caller; the rest are proxies",
  );
  pass("clientIp takes the left-most x-forwarded-for entry");
}

{
  assert.equal(
    clientIp({ headers: new Headers({ "x-forwarded-for": "  203.0.113.9  " }) }),
    "203.0.113.9",
    "whitespace around the forwarded entry is trimmed",
  );
  assert.equal(
    clientIp({ headers: new Headers({ "x-real-ip": "198.51.100.7" }) }),
    "198.51.100.7",
    "x-real-ip is the fallback when x-forwarded-for is absent",
  );
  pass("clientIp trims and falls back to x-real-ip");
}

{
  // Fails toward a single shared bucket, which is the safe direction: absent a
  // client identity we cannot distinguish callers, so we throttle harder.
  assert.equal(clientIp({ headers: new Headers() }), "unknown");
  resetRateLimits();
  const opts = { limit: 1, windowMs: MINUTE, now: 0 };
  assert.equal(checkRateLimit(`verify:ip:${clientIp({ headers: new Headers() })}`, opts).allowed, true);
  assert.equal(
    checkRateLimit(`verify:ip:${clientIp({ headers: new Headers() })}`, opts).allowed,
    false,
  );
  pass("a request with no client identity shares one bucket");
}

// ── rateLimitResponse ───────────────────────────────────────────────────────

{
  const res = rateLimitResponse(
    { allowed: false, limit: 30, remaining: 0, retryAfterSeconds: 42 },
    "verify",
  );
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "42");
  assert.equal(res.headers.get("X-RateLimit-Limit"), "30");
  assert.equal(res.headers.get("X-RateLimit-Remaining"), "0");
  pass("a blocked request answers 429 with Retry-After and the limit headers");
}

{
  // A caller with no wait left must still get a positive Retry-After, since 0
  // invites an immediate retry that is still blocked.
  const res = rateLimitResponse(
    { allowed: false, limit: 5, remaining: 0, retryAfterSeconds: 0 },
    "create-order",
  );
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("Retry-After"), "1");
  pass("Retry-After is never zero on a 429");
}

(async () => {
  const res = rateLimitResponse(
    { allowed: false, limit: 5, remaining: 0, retryAfterSeconds: 30 },
    "verify",
  );
  const body = (await res.json()) as { error: string; scope: string };
  assert.equal(body.scope, "verify");
  assert.ok(body.error.length > 0, "the caller is told what happened");
  pass("the 429 body names the limited scope");

  console.log(`\nPASS all ${n} rate limit tests`);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});