import assert from "node:assert/strict";
import Module from "node:module";
import {
  OUTBOUND_SEND_DISABLED_ENV,
  OUTBOUND_TEST_RECIPIENT_ENV,
} from "@/lib/email/outbound-policy";
import { EMAIL_TEMPLATE_ENV } from "@/lib/email/templates";

/**
 * Mocked behavioural tests for the outbound email paths that are driven by
 * the shared outbound-recipient policy:
 *
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
const emailSettingRows: Array<{ key: string; value: unknown }> = [];
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
  // Backs the per-email-type send toggles. Empty by default → every type keeps
  // its "all on" default, so the existing policy assertions are unaffected.
  siteSetting: { findMany: async () => emailSettingRows.slice() },
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
  inquiry: process.env[EMAIL_TEMPLATE_ENV.contactInquiry],
  repair: process.env[EMAIL_TEMPLATE_ENV.repairRequest],
};
function resetPolicyEnv() {
  delete process.env[OUTBOUND_TEST_RECIPIENT_ENV];
  delete process.env[OUTBOUND_SEND_DISABLED_ENV];
  // The inquiry/repair actions now refuse in a Preview (or unrecognised)
  // deployment. These behavioural tests exercise the non-Preview path, so pin
  // the environment regardless of where the suite is run.
  delete process.env.VERCEL_ENV;
  process.env.RESEND_API_KEY = "re_test_key";
  // The inquiry/repair actions send through a published Resend template; an
  // unconfigured id is a hard "not configured" refusal, so the behavioural
  // tests pin the ids they expect to be sent.
  process.env[EMAIL_TEMPLATE_ENV.contactInquiry] = "tpl_contact";
  process.env[EMAIL_TEMPLATE_ENV.repairRequest] = "tpl_repair";
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
  put(EMAIL_TEMPLATE_ENV.contactInquiry, saved.inquiry);
  put(EMAIL_TEMPLATE_ENV.repairRequest, saved.repair);
}

(async () => {
  try {
    // ── 1. paid-order confirmation ────────────────────────────────────────────
    {
      const { sendViaResend } = await import(
        "@/lib/notifications/send-paid-confirmation"
      );
      const message = {
        to: REAL,
        subject: "Order confirmed",
        template: { id: "tpl_shop", variables: { orderNumber: "KF-1" } },
      };

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

    // ── 2b. paid-order confirmation carries the Resend template ───────────────
    {
      const { sendViaResend } = await import(
        "@/lib/notifications/send-paid-confirmation"
      );
      const templated = {
        to: REAL,
        subject: "Payment received",
        template: { id: "tpl_shop", variables: { orderNumber: "KF-1" } },
      };

      resetPolicyEnv();
      captured.length = 0;
      let outcome = await sendViaResend(templated);
      assert.equal(outcome.kind, "accepted", "templated send should be accepted");
      assert.equal(
        captured[0].template?.id,
        "tpl_shop",
        "the template must be sent",
      );
      assert.equal(
        captured[0].html,
        undefined,
        "inline html must never be sent alongside a template",
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

      // A message with no template id is a definitive, retryable rejection — the
      // app never falls back to inline HTML.
      resetPolicyEnv();
      captured.length = 0;
      outcome = await sendViaResend({ to: REAL, subject: "Payment received" });
      assert.deepEqual(
        outcome,
        { kind: "rejected", reason: "template:not-configured" },
        "no template must be a definitive rejection",
      );
      assert.equal(captured.length, 0, "no template must not call the provider");

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

    // ── 5. per-email-type admin toggles (the first gate) ──────────────────────
    // A disabled toggle must stop the send even when every other policy would
    // allow it. The `emailNotifications.<type>` rows are the only thing changed.
    {
      const setToggle = (type: string, enabled: boolean) => {
        const key = `emailNotifications.${type}`;
        const existing = emailSettingRows.findIndex((r) => r.key === key);
        if (existing >= 0) emailSettingRows.splice(existing, 1);
        emailSettingRows.push({ key, value: enabled });
      };
      const clearToggles = () => {
        emailSettingRows.length = 0;
      };

      const { sendInquiry } = await import("@/app/actions/inquiry");
      const inquiryForm = () => {
        const fd = new FormData();
        fd.set("name", "Test Customer");
        fd.set("phone", "9876543210");
        fd.set("email", REAL);
        fd.set("deviceModel", "Test Board");
        fd.set("issue", "The device does not power on after a spill.");
        return fd;
      };
      resetPolicyEnv();

      // Disabled → honest failure (the inquiry is email-only and not persisted,
      // so success would be a lie) and nothing is sent. The default/enabled
      // inquiry behaviour is already covered by section 3.
      clearToggles();
      setToggle("contactInquiry", false);
      captured.length = 0;
      const disabledInquiry = await sendInquiry({}, inquiryForm());
      assert.ok(
        disabledInquiry.error,
        "disabled contact inquiry must report an honest failure, not success",
      );
      assert.equal(captured.length, 0, "disabled contact inquiry must not send");

      // Paid confirmation: disabled type → terminal suppression (never sent,
      // never a retryable rejection).
      const { sendViaResend } = await import(
        "@/lib/notifications/send-paid-confirmation"
      );
      const paid = {
        to: REAL,
        subject: "Order confirmed",
        template: { id: "tpl_shop", variables: { orderNumber: "KF-1" } },
        emailType: "shopOrderPaid" as const,
      };
      clearToggles();
      setToggle("shopOrderPaid", false);
      captured.length = 0;
      const disabled = await sendViaResend(paid);
      assert.deepEqual(
        disabled,
        { kind: "suppressed", reason: "disabled:shopOrderPaid" },
        "a disabled paid type must be a terminal suppression",
      );
      assert.equal(captured.length, 0, "disabled paid type must not send");

      // Guest order: core toggle on, guest toggle off → gated by the guest one.
      clearToggles();
      setToggle("shopOrderPaid", true);
      setToggle("guestOrderConfirmation", false);
      captured.length = 0;
      const guestDisabled = await sendViaResend({ ...paid, isGuest: true });
      assert.deepEqual(
        guestDisabled,
        { kind: "suppressed", reason: "disabled:guestOrderConfirmation" },
        "a guest order must also honour the guest toggle",
      );
      assert.equal(captured.length, 0, "guest-disabled order must not send");

      // Both on → sends.
      clearToggles();
      captured.length = 0;
      const accepted = await sendViaResend({ ...paid, isGuest: true });
      assert.equal(accepted.kind, "accepted", "guest order with both on must send");
      assert.equal(captured.length, 1, "guest order with both on must reach provider");

      clearToggles();
      pass("per-email-type toggles gate inquiry and paid confirmations");
    }

    console.log(`\nPASS all ${n} outbound path tests`);
  } finally {
    restoreEnv();
  }
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
