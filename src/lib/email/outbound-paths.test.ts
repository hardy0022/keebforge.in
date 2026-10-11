import assert from "node:assert/strict";
import Module from "node:module";
import {
  OUTBOUND_SEND_DISABLED_ENV,
  OUTBOUND_TEST_RECIPIENT_ENV,
} from "@/lib/email/outbound-policy";

/**
 * Mocked behavioural tests for the four outbound email paths that are driven by
 * the shared outbound-recipient policy:
 *
 *   - guest order confirmation  (sendGuestOrderConfirmation)
 *   - paid-order confirmation   (sendViaResend)
 *   - repair inquiry            (sendInquiry)
 *   - repair request            (submitRepairRequest)
 *
 * Every module dependency that would touch the network or a real database is
 * replaced through the CommonJS `Module._load` hook (the same technique as
 * order-success-page.test.ts and resend-verification.test.ts), so no email is
 * sent and no connection is opened. Each path is driven under three settings:
 * unset (the real recipient), a test-recipient override (redirected), and
 * suppression (no send at all).
 */

const REAL = "customer@example.org";
const TEST = "qa-inbox@example.net";
const CONTACT = "contact@keebforge.in";

type SendArgs = {
  to?: unknown;
  subject?: unknown;
  html?: unknown;
  replyTo?: unknown;
  template?: { id?: string; variables?: Record<string, unknown> };
};
const captured: SendArgs[] = [];

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

/** The fake Prisma client. Nothing here connects anywhere. */
const fakePrisma = {
  order: {
    create: async () => ({ id: "order_test_1" }),
    findUnique: async () => null,
    findMany: async () => [],
  },
  media: { createMany: async () => ({ count: 0 }) },
  address: { findFirst: async () => null },
  orderNotification: {
    createMany: async () => ({ count: 0 }),
    findUnique: async () => null,
    updateMany: async () => ({ count: 0 }),
  },
};

/**
 * Replace every dependency that would otherwise reach out (Resend), require a
 * Next request context (next/headers), or open a database connection
 * (@/lib/db/prisma, @/lib/auth/session, @/lib/orders/tracking).
 */
function installStubs() {
  const mod = Module as unknown as {
    _load: (
      this: unknown,
      request: string,
      parent: { filename?: string } | null,
      main: boolean,
    ) => unknown;
    __obpStubbed?: boolean;
  };
  if (mod.__obpStubbed) return;
  const orig = mod._load;

  const ResendStub = class {
    emails = {
      send: async (args: SendArgs) => {
        captured.push(args);
        return { data: { id: "test-email" }, error: null };
      },
    };
  };

  mod._load = function (request, parent, main) {
    if (request === "server-only") return {};
    if (request === "resend") return { Resend: ResendStub, default: ResendStub };
    if (request === "next/headers") {
      return {
        headers: async () => new Headers(),
        cookies: async () => ({ get: () => undefined }),
      };
    }
    if (request === "@/lib/db/prisma") return { prisma: fakePrisma };
    if (request === "@/lib/auth/session") {
      return { getCurrentAuth: async () => ({ profile: null }) };
    }
    if (request === "@/lib/orders/tracking") {
      return { syncTrackingCache: async () => {} };
    }
    return orig.call(this, request, parent, main);
  };
  mod.__obpStubbed = true;
}
installStubs();

const saved = {
  key: process.env.RESEND_API_KEY,
  from: process.env.EMAIL_FROM,
  redirect: process.env[OUTBOUND_TEST_RECIPIENT_ENV],
  disabled: process.env[OUTBOUND_SEND_DISABLED_ENV],
  vercel: process.env.VERCEL_ENV,
};
function resetPolicyEnv() {
  delete process.env[OUTBOUND_TEST_RECIPIENT_ENV];
  delete process.env[OUTBOUND_SEND_DISABLED_ENV];
  // The inquiry/repair actions now refuse in a Preview (or unrecognised)
  // deployment. These behavioural tests exercise the non-Preview path, so pin
  // the environment regardless of where the suite is run.
  delete process.env.VERCEL_ENV;
  process.env.RESEND_API_KEY = "re_test_key";
}
function restoreEnv() {
  const put = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  put("RESEND_API_KEY", saved.key);
  put("EMAIL_FROM", saved.from);
  put(OUTBOUND_TEST_RECIPIENT_ENV, saved.redirect);
  put(OUTBOUND_SEND_DISABLED_ENV, saved.disabled);
  put("VERCEL_ENV", saved.vercel);
}

(async () => {
  try {
    // ── 1. guest order confirmation ───────────────────────────────────────────
    {
      const { sendGuestOrderConfirmation } = await import(
        "@/lib/payments/order-confirmation-email"
      );
      const call = () =>
        sendGuestOrderConfirmation({
          to: REAL,
          orderNumber: "KFEMAIL1",
          exchangeCode: "code_test_1",
        });

      resetPolicyEnv();
      captured.length = 0;
      await call();
      assert.equal(captured.length, 1, "baseline: no confirmation email produced");
      assert.deepEqual(captured[0].to, [REAL], "baseline must reach the real guest");

      process.env[OUTBOUND_TEST_RECIPIENT_ENV] = TEST;
      captured.length = 0;
      await call();
      assert.deepEqual(captured[0].to, [TEST], "override must redirect the guest email");

      delete process.env[OUTBOUND_TEST_RECIPIENT_ENV];
      process.env[OUTBOUND_SEND_DISABLED_ENV] = "true";
      captured.length = 0;
      await call();
      assert.equal(captured.length, 0, "disabled must suppress the guest email");

      pass("guest order confirmation redirects/suppresses/sends per policy");
    }

    // ── 2. paid-order confirmation ────────────────────────────────────────────
    {
      const { sendViaResend } = await import(
        "@/lib/notifications/send-paid-confirmation"
      );
      const message = { to: REAL, subject: "Order confirmed", html: "<p>x</p>" };

      resetPolicyEnv();
      captured.length = 0;
      let outcome = await sendViaResend(message);
      assert.equal(outcome.kind, "accepted", "baseline: provider did not accept");
      assert.equal(captured[0].to, REAL, "baseline must reach the real customer");

      process.env[OUTBOUND_TEST_RECIPIENT_ENV] = TEST;
      captured.length = 0;
      outcome = await sendViaResend(message);
      assert.equal(outcome.kind, "accepted", "redirect: provider did not accept");
      assert.equal(captured[0].to, TEST, "override must redirect the paid email");

      delete process.env[OUTBOUND_TEST_RECIPIENT_ENV];
      process.env[OUTBOUND_SEND_DISABLED_ENV] = "true";
      captured.length = 0;
      outcome = await sendViaResend(message);
      assert.equal(outcome.kind, "rejected", "disabled must be a definitive rejection");
      assert.ok(
        outcome.kind === "rejected" && outcome.reason.startsWith("suppressed:"),
        "disabled must be recorded as suppressed",
      );
      assert.equal(captured.length, 0, "disabled must not call the provider");

      // Unconfigured provider is also definitive and never suppressed-silently.
      resetPolicyEnv();
      delete process.env.RESEND_API_KEY;
      captured.length = 0;
      outcome = await sendViaResend(message);
      assert.deepEqual(
        outcome,
        { kind: "rejected", reason: "resend:not-configured" },
        "no api key must be a definitive, retryable rejection",
      );
      assert.equal(captured.length, 0, "no api key must not call the provider");

      pass("paid-order confirmation redirects/suppresses/sends per policy");
    }

    // ── 2b. paid-order confirmation via a Resend template ─────────────────────
    {
      const { sendViaResend } = await import(
        "@/lib/notifications/send-paid-confirmation"
      );
      const templated = {
        to: REAL,
        subject: "Payment received",
        html: "<p>fallback</p>",
        template: { id: "tpl_shop", variables: { orderNumber: "KF-1" } },
      };

      resetPolicyEnv();
      captured.length = 0;
      let outcome = await sendViaResend(templated);
      assert.equal(outcome.kind, "accepted", "templated send should be accepted");
      assert.equal(
        captured[0].template?.id,
        "tpl_shop",
        "the template must be sent, not the inline html",
      );
      assert.equal(
        captured[0].html,
        undefined,
        "html must not be sent alongside a template",
      );

      // Redirect still applies to the templated send.
      process.env[OUTBOUND_TEST_RECIPIENT_ENV] = TEST;
      captured.length = 0;
      outcome = await sendViaResend(templated);
      assert.equal(outcome.kind, "accepted");
      assert.equal(captured[0].to, TEST, "override must redirect the templated send");

      // Suppression still wins over a template: nothing leaves the building.
      delete process.env[OUTBOUND_TEST_RECIPIENT_ENV];
      process.env[OUTBOUND_SEND_DISABLED_ENV] = "true";
      captured.length = 0;
      outcome = await sendViaResend(templated);
      assert.equal(outcome.kind, "rejected", "suppression is a definitive rejection");
      assert.ok(
        outcome.kind === "rejected" && outcome.reason.startsWith("suppressed:"),
        "suppression must be recorded as suppressed",
      );
      assert.equal(captured.length, 0, "suppressed template must not call the provider");

      // Without a template id, the inline html fallback is still sent.
      resetPolicyEnv();
      captured.length = 0;
      outcome = await sendViaResend({
        to: REAL,
        subject: "Payment received",
        html: "<p>fallback</p>",
      });
      assert.equal(outcome.kind, "accepted");
      assert.equal(captured[0].html, "<p>fallback</p>");
      assert.equal(captured[0].template, undefined);

      pass("templated paid confirmation: template sent, policy still enforced");
    }

    // ── 3. repair inquiry ─────────────────────────────────────────────────────
    {
      const { sendInquiry } = await import("@/app/actions/inquiry");
      const form = () => {
        const fd = new FormData();
        fd.set("name", "Test Customer");
        fd.set("phone", "9876543210");
        fd.set("email", REAL);
        fd.set("deviceModel", "Test Board");
        fd.set("issue", "The device does not power on after a spill.");
        return fd;
      };

      resetPolicyEnv();
      captured.length = 0;
      let state = await sendInquiry({}, form());
      assert.deepEqual(state, { ok: true }, "baseline: inquiry should report success");
      assert.deepEqual(captured[0].to, [CONTACT], "baseline must reach the contact inbox");

      process.env[OUTBOUND_TEST_RECIPIENT_ENV] = TEST;
      captured.length = 0;
      state = await sendInquiry({}, form());
      assert.deepEqual(state, { ok: true }, "redirect: inquiry should report success");
      assert.deepEqual(captured[0].to, [TEST], "override must redirect the inquiry");

      delete process.env[OUTBOUND_TEST_RECIPIENT_ENV];
      process.env[OUTBOUND_SEND_DISABLED_ENV] = "true";
      captured.length = 0;
      state = await sendInquiry({}, form());
      assert.deepEqual(state, { ok: true }, "disabled: inquiry should still report success");
      assert.equal(captured.length, 0, "disabled must suppress the inquiry");

      pass("repair inquiry redirects/suppresses/sends per policy");
    }

    // ── 4. repair request ─────────────────────────────────────────────────────
    {
      const { submitRepairRequest } = await import(
        "@/app/actions/repair-request"
      );
      const form = () => {
        const fd = new FormData();
        fd.set("serviceType", "repair");
        fd.set("deviceType", "KEYBOARD");
        fd.set("brand", "Acme");
        fd.set("model", "Model X");
        fd.append("workTypes", "Lubing");
        fd.set("description", "The spacebar is unreliable and the board is noisy.");
        fd.set("firstName", "Test");
        fd.set("lastName", "Customer");
        fd.set("phone", "9876543210");
        fd.set("email", REAL);
        fd.set("shippingMethod", "UNSURE");
        return fd;
      };

      resetPolicyEnv();
      captured.length = 0;
      let state = await submitRepairRequest({}, form());
      assert.ok(state.ok && state.orderNumber, "baseline: repair request should persist");
      assert.deepEqual(captured[0].to, [CONTACT], "baseline must reach the contact inbox");

      process.env[OUTBOUND_TEST_RECIPIENT_ENV] = TEST;
      captured.length = 0;
      state = await submitRepairRequest({}, form());
      assert.ok(state.ok, "redirect: repair request should persist");
      assert.deepEqual(captured[0].to, [TEST], "override must redirect the repair request");

      delete process.env[OUTBOUND_TEST_RECIPIENT_ENV];
      process.env[OUTBOUND_SEND_DISABLED_ENV] = "true";
      captured.length = 0;
      state = await submitRepairRequest({}, form());
      assert.ok(state.ok, "disabled: repair request should still persist");
      assert.equal(captured.length, 0, "disabled must suppress the repair request email");

      pass("repair request redirects/suppresses/sends per policy");
    }

    console.log(`\nPASS all ${n} outbound path tests`);
  } finally {
    restoreEnv();
  }
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
