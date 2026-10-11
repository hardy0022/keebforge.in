import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { APIError } from "better-auth";
import { RESEND_FAILURE_MESSAGE, RESEND_SUCCESS_MESSAGE, VERIFICATION_RESEND_PATH, resendVerificationEmail } from "@/lib/auth/resend-verification";

/**
 * The resend action on /auth/error exists because an unverified local account
 * is refused by Google sign-in. Two things have to hold for it to be honest
 * and safe:
 *
 *  1. The UI must not claim "sent" when the provider actually failed. The old
 *     verification-mail callback swallowed every Resend error, which made
 *     Better Auth's endpoint answer `{ status: true }` regardless.
 *  2. It must not become an open relay. It reuses Better Auth's own endpoint
 *     (rate limited, non-enumerating) rather than a new route of our own, and
 *     neither the provider's error text nor any secret may reach the user.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const REPO = path.resolve(__dirname, "../../..");

/**
 * `send-verification-email.ts` now resolves its recipient through the
 * server-only outbound policy (`@/lib/email/outbound`). `server-only` is
 * supplied by Next.js and has no node resolution, so tsx cannot load the module
 * unless we answer it with an empty object — which is what it resolves to on the
 * server anyway. Same approach as payment-endpoints.test.ts.
 */
function installServerOnlyStub() {
  const mod = Module as unknown as {
    _load: (
      this: unknown,
      request: string,
      parent: { filename?: string } | null,
      main: boolean,
    ) => unknown;
    __rvStubbed?: boolean;
  };
  if (mod.__rvStubbed) return;
  const orig = mod._load;
  mod._load = function (request, parent, main) {
    if (request === "server-only") return {};
    return orig.call(this, request, parent, main);
  };
  mod.__rvStubbed = true;
}
installServerOnlyStub();

/** Provider text that must never appear in anything user-facing. */
const LEAKY = "Invalid API key: re_sentinel_do_not_leak. Contact support at api@resend.com";

(async () => {
  const { sendVerificationEmailMessage } = await import(
    "@/lib/auth/send-verification-email"
  );

  // ── G. success state ──────────────────────────────────────────────────────
  {
    const outcome = await resendVerificationEmail(
      "buyer@example.com",
      async () => ({ data: {}, error: null }),
    );
    assert.equal(outcome.status, "success");
    assert.equal(outcome.message, RESEND_SUCCESS_MESSAGE);
    assert.ok(!/api key|resend|re_/i.test(outcome.message));
    pass("a successful send reports the success state");
  }

  // ── G. provider failure → failure state, no leakage ───────────────────────
  {
    const fromProvider = await resendVerificationEmail(
      "buyer@example.com",
      async () => ({ error: { message: LEAKY } }),
    );
    assert.equal(fromProvider.status, "error");
    assert.equal(fromProvider.message, RESEND_FAILURE_MESSAGE);
    assert.ok(
      !fromProvider.message.includes("API key"),
      "provider error text must not reach the UI",
    );

    const thrown = await resendVerificationEmail(
      "buyer@example.com",
      async () => {
        throw new Error(LEAKY);
      },
    );
    assert.equal(thrown.status, "error");
    assert.equal(thrown.message, RESEND_FAILURE_MESSAGE);
    assert.ok(!thrown.message.includes("resend"));

    const nullish = await resendVerificationEmail(
      "buyer@example.com",
      async () => null,
    );
    assert.equal(nullish.status, "success", "an empty response is not an error");

    pass("provider failures map to a failure state with no secret/provider leakage");
  }

  // ── G. the server reports failure truthfully ──────────────────────────────
  {
    // Accepted by the provider → resolves, no throw.
    await sendVerificationEmailMessage(
      { user: { name: "Buyer", email: "buyer@example.com" }, url: "https://keebforge.in/verify-email?token=t" },
      async () => ({ data: { id: "msg_1" }, error: null }),
    );

    // Resend returns (does not throw) an API-level rejection.
    let caught: unknown;
    try {
      await sendVerificationEmailMessage(
        { user: { name: "Buyer", email: "buyer@example.com" }, url: "https://x/y" },
        async () => ({ data: null, error: { message: LEAKY } }),
      );
    } catch (e) {
      caught = e;
    }
    assert.ok(caught instanceof APIError, "a rejected send must surface as an error");
    assert.equal((caught as APIError).statusCode, 503);
    assert.equal(
      (caught as APIError).message,
      "Verification email could not be sent.",
      "the caller gets a fixed message",
    );
    assert.ok(!(caught as APIError).message.includes("API key"));

    // Transport-level rejection (network, SDK) behaves the same way.
    let caught2: unknown;
    try {
      await sendVerificationEmailMessage(
        { user: { name: "Buyer", email: "buyer@example.com" }, url: "https://x/y" },
        async () => {
          throw new Error(LEAKY);
        },
      );
    } catch (e) {
      caught2 = e;
    }
    assert.ok(caught2 instanceof APIError);
    assert.equal((caught2 as APIError).message, "Verification email could not be sent.");

    pass("the sender rejects on provider failure instead of pretending success");
  }

  // ── G. rate limiting / existing security controls preserved ───────────────
  {
    assert.equal(
      VERIFICATION_RESEND_PATH,
      "/send-verification-email",
      "the resend must target Better Auth's built-in endpoint",
    );

    const rateLimiter = fs.readFileSync(
      path.join(REPO, "node_modules/better-auth/dist/api/rate-limiter/index.mjs"),
      "utf8",
    );
    const occurrence = rateLimiter.indexOf("/send-verification-email");
    assert.ok(
      occurrence > -1,
      "better-auth's default special rules must still cover this path",
    );
    const ruleWindow = rateLimiter.slice(
      Math.max(0, occurrence - 600),
      occurrence + 600,
    );
    assert.ok(ruleWindow.includes("window: 60"), "the 60s window still applies");
    assert.ok(ruleWindow.includes("max: 3"), "the 3-per-window cap still applies");

    const createContext = fs.readFileSync(
      path.join(REPO, "node_modules/better-auth/dist/context/create-context.mjs"),
      "utf8",
    );
    assert.ok(
      createContext.includes("enabled: options.rateLimit?.enabled ?? isProduction"),
      "rate limiting must still default to on in production",
    );

    const appConfig = fs.readFileSync(
      path.join(REPO, "src/lib/auth/better-auth.ts"),
      "utf8",
    );
    assert.ok(
      !appConfig.includes("rateLimit"),
      "the app must not override better-auth's rate limit configuration",
    );

    // No bespoke email endpoint was added alongside the catch-all handler.
    const authRoutes = fs.readdirSync(
      path.join(REPO, "src/app/api/auth"),
    );
    assert.deepEqual(
      authRoutes.sort(),
      ["[...all]", "check-username", "me"],
      "no new auth route may be introduced",
    );

    pass("resend uses the existing rate-limited endpoint, not a new one");
  }

  // ── success copy stays non-enumerating ────────────────────────────────────
  {
    assert.match(RESEND_SUCCESS_MESSAGE, /^If that email needs verifying/);
    assert.ok(
      !/exists|account|registered|not found/i.test(RESEND_SUCCESS_MESSAGE),
      "success copy must not reveal whether an account exists",
    );
    pass("resend copy never discloses whether an account exists");
  }

  console.log(`\nPASS all ${n} resend verification tests`);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
