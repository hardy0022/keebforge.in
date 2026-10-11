import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import {
  OUTBOUND_SEND_DISABLED_ENV,
  OUTBOUND_TEST_RECIPIENT_ENV,
  isDeliverableAddress,
  planOutboundRecipient,
} from "@/lib/email/outbound-policy";

/**
 * Focused tests for the shared outbound-email recipient policy.
 *
 * Part A exercises the pure decision core directly. Part B pins each of the six
 * outbound paths to the policy so a future edit cannot quietly drop the guard.
 * Part C drives the one path with an injectable transport (verification) under
 * each setting and asserts where the message actually went — without a network
 * call and without ever using a real recipient address.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const REPO = path.resolve(__dirname, "../../..");

/** Next.js supplies `server-only`; tsx needs an empty stand-in to load it. */
function installServerOnlyStub() {
  const mod = Module as unknown as {
    _load: (
      this: unknown,
      request: string,
      parent: { filename?: string } | null,
      main: boolean,
    ) => unknown;
    __obStubbed?: boolean;
  };
  if (mod.__obStubbed) return;
  const orig = mod._load;
  mod._load = function (request, parent, main) {
    if (request === "server-only") return {};
    return orig.call(this, request, parent, main);
  };
  mod.__obStubbed = true;
}
installServerOnlyStub();

const REAL = "customer@example.org";
const TEST = "qa-inbox@example.net";

(async () => {
  // ── A. pure decision core ─────────────────────────────────────────────────
  {
    const passthrough = planOutboundRecipient(REAL, {});
    assert.deepEqual(passthrough, {
      action: "send",
      to: REAL,
      redirected: false,
    });

    const redirect = planOutboundRecipient(REAL, {
      [OUTBOUND_TEST_RECIPIENT_ENV]: TEST,
    });
    assert.deepEqual(redirect, { action: "send", to: TEST, redirected: true });

    // Blank override behaves as "unset", not as a recipient.
    assert.deepEqual(
      planOutboundRecipient(REAL, { [OUTBOUND_TEST_RECIPIENT_ENV]: "   " }),
      { action: "send", to: REAL, redirected: false },
    );

    pass("unset/blank config passes the real recipient through unchanged");
  }

  {
    for (const flag of ["1", "true", "on", "yes", "TRUE", "  Yes "]) {
      assert.deepEqual(
        planOutboundRecipient(REAL, { [OUTBOUND_SEND_DISABLED_ENV]: flag }),
        { action: "skip", reason: "disabled" },
        `EMAIL_SEND_DISABLED=${flag} must suppress`,
      );
    }

    // Falsy spellings do not disable; an override still applies normally.
    for (const flag of ["false", "0", "off", "no", ""]) {
      assert.deepEqual(
        planOutboundRecipient(REAL, {
          [OUTBOUND_SEND_DISABLED_ENV]: flag,
          [OUTBOUND_TEST_RECIPIENT_ENV]: TEST,
        }),
        { action: "send", to: TEST, redirected: true },
        `EMAIL_SEND_DISABLED=${JSON.stringify(flag)} must not suppress`,
      );
    }

    pass("EMAIL_SEND_DISABLED honours truthy spellings only");
  }

  {
    // A suppression sentinel is never used as an address.
    for (const sentinel of ["SUPPRESS", "suppress", "DISABLED", "off", "NONE"]) {
      const plan = planOutboundRecipient(REAL, {
        [OUTBOUND_TEST_RECIPIENT_ENV]: sentinel,
      });
      assert.equal(plan.action, "skip", `${sentinel} must suppress`);
    }

    // A malformed override is refused — never downgraded to the real address.
    for (const bad of ["not-an-email", "a@b", "a@@b.com", "a b@c.com", "a@b.", "<x@y.com>"]) {
      const plan = planOutboundRecipient(REAL, {
        [OUTBOUND_TEST_RECIPIENT_ENV]: bad,
      });
      assert.deepEqual(
        plan,
        { action: "skip", reason: "invalid-override" },
        `${JSON.stringify(bad)} must be refused, not sent`,
      );
    }

    pass("sentinels and malformed overrides fail closed (never a real recipient)");
  }

  {
    assert.deepEqual(
      planOutboundRecipient(REAL, {
        [OUTBOUND_TEST_RECIPIENT_ENV]: TEST,
        [OUTBOUND_SEND_DISABLED_ENV]: "true",
      }),
      { action: "skip", reason: "contradictory" },
    );
    pass("suppression + override together is contradictory and skips");
  }

  {
    assert.ok(isDeliverableAddress("a@b.co"));
    assert.ok(!isDeliverableAddress("SUPPRESS"));
    assert.ok(!isDeliverableAddress("a@b"));
    assert.ok(!isDeliverableAddress("a@@b.co"));
    assert.ok(!isDeliverableAddress("a@b..co"));
    assert.ok(!isDeliverableAddress("a@b.co\nbcc:x@y.co"));
    pass("address validation rejects sentinels, whitespace and header injection");
  }

  // ── B. every outbound path is wired to the policy ─────────────────────────
  {
    const wrapper = fs.readFileSync(
      path.join(REPO, "src/lib/email/outbound.ts"),
      "utf8",
    );
    assert.ok(wrapper.includes('import "server-only"'), "policy entry must be server-only");
    assert.ok(wrapper.includes("process.env"), "policy entry supplies process.env");
    assert.ok(wrapper.includes("resolveOutboundRecipient"));

    const core = fs.readFileSync(
      path.join(REPO, "src/lib/email/outbound-policy.ts"),
      "utf8",
    );
    assert.ok(
      !core.includes("process.env"),
      "the pure core must not read process.env at import time",
    );

    const paths: Array<{ file: string; to: string }> = [
      { file: "src/lib/notifications/send-paid-confirmation.ts", to: "to: plan.to," },
      { file: "src/lib/payments/order-confirmation-email.ts", to: "to: [plan.to]," },
      { file: "src/lib/auth/better-auth.ts", to: "to: plan.to," },
      { file: "src/lib/auth/send-verification-email.ts", to: "to: plan.to," },
      { file: "src/app/actions/inquiry.ts", to: "to: [plan.to]," },
      { file: "src/app/actions/repair-request.ts", to: "to: [plan.to]," },
    ];

    for (const { file, to } of paths) {
      const src = fs.readFileSync(path.join(REPO, file), "utf8");
      assert.ok(
        src.includes('from "@/lib/email/outbound"'),
        `${file} must import the server-only policy`,
      );
      assert.ok(
        src.includes("resolveOutboundRecipient("),
        `${file} must resolve its recipient through the policy`,
      );
      assert.ok(
        src.includes('plan.action === "skip"'),
        `${file} must branch on suppression`,
      );
      assert.ok(src.includes(to), `${file} must send to the resolved recipient`);
    }

    pass("all six outbound paths route their recipient through the policy");
  }

  // ── C. verification path honours the policy end-to-end ────────────────────
  {
    const { sendVerificationEmailMessage } = await import(
      "@/lib/auth/send-verification-email"
    );

    const args = {
      user: { name: "Buyer", email: REAL },
      url: "https://keebforge.in/verify-email?token=t",
    };
    const sent: string[] = [];
    const deliver = async (mail: { to: string }) => {
      sent.push(mail.to);
      return { data: { id: "msg_test" }, error: null };
    };

    const savedOverride = process.env[OUTBOUND_TEST_RECIPIENT_ENV];
    const savedDisabled = process.env[OUTBOUND_SEND_DISABLED_ENV];
    const restore = () => {
      if (savedOverride === undefined) delete process.env[OUTBOUND_TEST_RECIPIENT_ENV];
      else process.env[OUTBOUND_TEST_RECIPIENT_ENV] = savedOverride;
      if (savedDisabled === undefined) delete process.env[OUTBOUND_SEND_DISABLED_ENV];
      else process.env[OUTBOUND_SEND_DISABLED_ENV] = savedDisabled;
    };

    try {
      // Baseline: no settings → the real address.
      restore();
      sent.length = 0;
      await sendVerificationEmailMessage(args, deliver);
      assert.deepEqual(sent, [REAL], "no config must reach the real recipient");

      // Override → the test address, never the real one.
      process.env[OUTBOUND_TEST_RECIPIENT_ENV] = TEST;
      sent.length = 0;
      await sendVerificationEmailMessage(args, deliver);
      assert.deepEqual(sent, [TEST], "override must redirect");

      // Disabled → nothing is delivered, and it resolves quietly.
      delete process.env[OUTBOUND_TEST_RECIPIENT_ENV];
      process.env[OUTBOUND_SEND_DISABLED_ENV] = "true";
      sent.length = 0;
      await sendVerificationEmailMessage(args, deliver);
      assert.equal(sent.length, 0, "disabled must suppress the send");

      // Sentinel and malformed override must suppress, not fall back.
      delete process.env[OUTBOUND_SEND_DISABLED_ENV];
      for (const value of ["SUPPRESS", "not-an-email"]) {
        process.env[OUTBOUND_TEST_RECIPIENT_ENV] = value;
        sent.length = 0;
        await sendVerificationEmailMessage(args, deliver);
        assert.equal(sent.length, 0, `${value} must suppress, not send`);
      }

      // A provider error still surfaces even when redirected (policy must not
      // mask delivery failures).
      process.env[OUTBOUND_TEST_RECIPIENT_ENV] = TEST;
      let failed = false;
      try {
        await sendVerificationEmailMessage(args, async () => ({
          data: null,
          error: { message: "rejected" },
        }));
      } catch {
        failed = true;
      }
      assert.ok(failed, "a rejected send must still throw when redirected");
    } finally {
      restore();
    }

    pass("verification path redirects/suppresses/sends exactly per policy");
  }

  console.log(`\nPASS all ${n} outbound policy tests`);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
