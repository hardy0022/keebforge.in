import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";

/**
 * Unit tests for the per-email-type sending toggles.
 *
 * Two layers are covered:
 *   - the pure decision logic (`@/lib/email/email-policy`) — defaults, stored
 *     values, and the fail-open/fail-closed behaviour on a failed read;
 *   - the server reader/gate (`@/lib/email/email-settings`) — reading the
 *     `SiteSetting` rows and the `canSendEmail` contract, plus the verification
 *     path's consultation of it (driven with an injected transport).
 *
 * The Prisma client and `server-only` are replaced through the CommonJS
 * `Module._load` hook (as in outbound-paths.test.ts) so no database is opened.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const REPO = path.resolve(__dirname, "../../..");

/** Mutable backing rows for the fake SiteSetting table. */
const rows: Array<{ key: string; value: unknown }> = [];
let findManyThrows = false;
const fakePrisma = {
  siteSetting: {
    findMany: async () => {
      if (findManyThrows) throw new Error("settings read failed");
      return rows.slice();
    },
  },
};

function installStubs() {
  const mod = Module as unknown as {
    _load: (
      this: unknown,
      request: string,
      parent: { filename?: string } | null,
      main: boolean,
    ) => unknown;
    __etsStubbed?: boolean;
  };
  if (mod.__etsStubbed) return;
  const orig = mod._load;
  mod._load = function (request, parent, main) {
    if (request === "server-only") return {};
    if (request === "@/lib/db/prisma") return { prisma: fakePrisma };
    return orig.call(this, request, parent, main);
  };
  mod.__etsStubbed = true;
}
installStubs();

const reset = () => {
  rows.length = 0;
  findManyThrows = false;
};
const set = (type: string, value: unknown) => {
  rows.push({ key: `emailNotifications.${type}`, value });
};

(async () => {
  const policy = await import("@/lib/email/email-policy");
  const settings = await import("@/lib/email/email-settings");
  const { EMAIL_TYPES, planEmailSend, emailSettingKey, isEmailType } = policy;
  // ── 1. the seven toggle types exist ────────────────────────────────────────
  {
    assert.deepEqual(
      [...EMAIL_TYPES].sort(),
      [
        "contactInquiry",
        "emailVerification",
        "guestOrderConfirmation",
        "modsOrderPaid",
        "passwordReset",
        "repairRequest",
        "shopOrderPaid",
      ].sort(),
      "every email path must have a toggle",
    );
    assert.equal(emailSettingKey("passwordReset"), "emailNotifications.passwordReset");
    assert.ok(isEmailType("shopOrderPaid"));
    assert.ok(!isEmailType("notARealType"));
    assert.ok(!isEmailType(null));
    pass("the seven email toggles are defined and guarded");
  }

  // ── 2. pure planner: defaults, stored values, failed reads ─────────────────
  {
    // No stored value → every type defaults to ON (behaviour is unchanged).
    for (const type of EMAIL_TYPES) {
      assert.equal(planEmailSend(type, {}), true, `${type} must default on`);
      assert.equal(planEmailSend(type, { [type]: false }), false, `${type} honours off`);
      assert.equal(planEmailSend(type, { [type]: true }), true, `${type} honours on`);
    }

    // Failed read: account/order-critical mail stays on, optional stays off.
    for (const type of ["passwordReset", "emailVerification", "shopOrderPaid", "modsOrderPaid", "guestOrderConfirmation"] as const) {
      assert.equal(
        planEmailSend(type, {}, true),
        true,
        `${type} must fail open on a read error`,
      );
    }
    for (const type of ["contactInquiry", "repairRequest"] as const) {
      assert.equal(
        planEmailSend(type, {}, true),
        false,
        `${type} must fail closed on a read error`,
      );
    }
    pass("planner defaults on, honours stored values, fails safe on read error");
  }

  // ── 3. server reader + central gate ────────────────────────────────────────
  {
    reset();
    let read = await settings.readEmailSettings();
    assert.deepEqual(read, { settings: {}, readFailed: false });
    assert.equal(await settings.canSendEmail("contactInquiry"), true);

    reset();
    set("contactInquiry", false);
    set("shopOrderPaid", false);
    set("repairRequest", true);
    // Rows for unknown keys / non-boolean values are ignored.
    rows.push({ key: "emailNotifications.bogus", value: false });
    rows.push({ key: "emailNotifications.passwordReset", value: "yes" });
    read = await settings.readEmailSettings();
    assert.equal(read.readFailed, false);
    assert.deepEqual(read.settings, {
      contactInquiry: false,
      shopOrderPaid: false,
      repairRequest: true,
    });
    assert.equal(await settings.canSendEmail("contactInquiry"), false);
    assert.equal(await settings.canSendEmail("shopOrderPaid"), false);
    assert.equal(await settings.canSendEmail("repairRequest"), true);
    // Unstored type still falls back to the default.
    assert.equal(await settings.canSendEmail("passwordReset"), true);

    // A failed read never throws and applies the failure defaults.
    reset();
    findManyThrows = true;
    read = await settings.readEmailSettings();
    assert.equal(read.readFailed, true);
    assert.deepEqual(read.settings, {});
    assert.equal(await settings.canSendEmail("passwordReset"), true);
    assert.equal(await settings.canSendEmail("shopOrderPaid"), true);
    assert.equal(await settings.canSendEmail("contactInquiry"), false);
    assert.equal(await settings.canSendEmail("repairRequest"), false);

    reset();
    pass("reader parses stored rows, ignores junk, and never throws on failure");
  }

  // ── 4. the verification path consults the toggle ───────────────────────────
  {
    const { sendVerificationEmailMessage } = await import(
      "@/lib/auth/send-verification-email"
    );
    const args = {
      user: { name: "Buyer", email: "buyer@example.com" },
      url: "https://keebforge.in/verify-email?token=t",
    };

    // Disabled → the injected transport is never called, and it resolves.
    reset();
    set("emailVerification", false);
    let called = 0;
    await sendVerificationEmailMessage(args, async () => {
      called += 1;
      return { data: { id: "msg_1" }, error: null };
    });
    assert.equal(called, 0, "a disabled verification toggle must not send");

    // Enabled → the transport is called exactly once.
    reset();
    set("emailVerification", true);
    called = 0;
    await sendVerificationEmailMessage(args, async () => {
      called += 1;
      return { data: { id: "msg_1" }, error: null };
    });
    assert.equal(called, 1, "an enabled verification toggle must send");

    reset();
    pass("verification email honours the emailVerification toggle");
  }

  // ── 5. every outbound Resend path is wired to the central gate ─────────────
  {
    const expected: Array<[string, string]> = [
      ["src/lib/auth/better-auth.ts", 'canSendEmail("passwordReset")'],
      ["src/lib/auth/send-verification-email.ts", 'canSendEmail("emailVerification")'],
      ["src/app/actions/inquiry.ts", 'canSendEmail("contactInquiry")'],
      ["src/app/actions/repair-request.ts", 'canSendEmail("repairRequest")'],
    ];
    for (const [file, needle] of expected) {
      const source = fs.readFileSync(path.join(REPO, file), "utf8");
      assert.ok(source.includes(needle), `${file} must consult ${needle}`);
    }

    // The paid path gates on the message's emailType (and the guest toggle).
    const paid = fs.readFileSync(
      path.join(REPO, "src/lib/notifications/send-paid-confirmation.ts"),
      "utf8",
    );
    assert.ok(paid.includes("canSendEmail(message.emailType)"));
    assert.ok(paid.includes('canSendEmail("guestOrderConfirmation")'));
    assert.ok(paid.includes("disabled:"), "a disabled paid type is a suppression");

    pass("all six outbound paths consult the centralized send policy");
  }

  // ── 6. REQUIRED/CORE types are locked against disabling ────────────────────
  {
    const { EMAIL_LOCKED_TYPES, isEmailTypeLocked } = policy;
    assert.deepEqual(
      [...EMAIL_LOCKED_TYPES].sort(),
      ["modsOrderPaid", "passwordReset", "shopOrderPaid"].sort(),
      "only the required/core types are locked",
    );
    for (const type of EMAIL_LOCKED_TYPES) {
      assert.equal(isEmailTypeLocked(type), true, `${type} must be locked`);
    }
    for (const type of ["emailVerification", "contactInquiry", "repairRequest", "guestOrderConfirmation"] as const) {
      assert.equal(isEmailTypeLocked(type), false, `${type} must stay toggleable`);
    }

    // The server action is the real enforcement: it must reject a disable even
    // if the request bypasses the UI.
    const action = fs.readFileSync(
      path.join(REPO, "src/app/admin/actions/settings.ts"),
      "utf8",
    );
    assert.ok(action.includes("isEmailTypeLocked"), "the action must consult the lock");
    assert.ok(
      action.includes("cannot be disabled"),
      "the action must reject disabling a locked type",
    );

    // The card hides the control for locked types.
    const card = fs.readFileSync(
      path.join(REPO, "src/app/admin/settings/EmailNotificationsCard.tsx"),
      "utf8",
    );
    assert.ok(card.includes("isEmailTypeLocked"), "the card must consult the lock");
    assert.ok(card.includes("ALWAYS ON"), "a locked type must render a static label");
    pass("required/core types are locked in the UI and enforced in the action");
  }

  console.log(`\nPASS all ${n} email settings tests`);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
