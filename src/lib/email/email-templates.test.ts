import assert from "node:assert/strict";
import {
  EMAIL_TEMPLATE_ENV,
  contactInquiryEmail,
  esc,
  passwordResetEmail,
  readTemplateIds,
  repairRequestEmail,
  templateRef,
  verificationEmail,
} from "@/lib/email/templates";
import {
  buildModsPaidConfirmation,
  buildPaidConfirmation,
  buildShopPaidConfirmation,
  runPaidConfirmation,
  type PaidConfirmationDeps,
  type PaidConfirmationOrder,
  type SendOutcome,
} from "@/lib/notifications/paid-confirmation";

/**
 * Resend-managed email templates.
 *
 * Pins the guarantees that keep the application authoritative when a template is
 * configured:
 *
 *   1. Template ids come only from environment variables; a missing or blank id
 *      is reported as unconfigured (no invented id, no inline fallback).
 *   2. Template variables are built from the same server-side snapshots the
 *      application always used, with list content pre-escaped into `*Html`
 *      fragments (Resend inserts `{{{KEY}}}` unescaped).
 *   3. The paid-notification state machine is untouched: a configured template
 *      rides along on the message, and SENT / FAILED / NEEDS_REVIEW are still
 *      decided solely by the Resend outcome.
 *
 * No email is ever sent: every send here is a stub, and the builders are pure.
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const shopOrder: PaidConfirmationOrder = {
  id: "ord_shop",
  orderNumber: "KF-2026-000123",
  type: "PRODUCT",
  customerName: "Ada <Lovelace>",
  customerEmail: "ada@example.org",
  paymentStatus: "PAID",
  total: 100000,
  paidAmount: 100000,
  items: [
    { name: "Hot-swap <TKL>", quantity: 2, unitPrice: 50000, lineTotal: 100000 },
  ],
  services: [],
  summary: null,
  shippingMode: null,
  shippingAddress: null,
};

const modsOrder: PaidConfirmationOrder = {
  id: "ord_mods",
  orderNumber: "KF-2026-000456",
  type: "SERVICE",
  customerName: "Grace Hopper",
  customerEmail: "grace@example.org",
  paymentStatus: "PAID",
  total: 24500,
  paidAmount: 24500,
  items: [],
  services: [
    {
      name: "Gasket mount install",
      quantity: 1,
      unitPrice: 10000,
      lineTotal: 10000,
    },
  ],
  summary: {
    brand: "Wooting",
    model: "60HE",
    layout: "60%",
    modsShipping: { method: "customer_shipping" },
  },
  shippingMode: "express",
  shippingAddress: {
    streetAddress: "Flat 4B, Lake View",
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
  },
};

function fakeDeps(outcome: SendOutcome) {
  const calls = { claim: 0, sent: 0, failed: 0, review: 0 };
  let lastMessage: Parameters<PaidConfirmationDeps["send"]>[0] | null = null;
  const deps: PaidConfirmationDeps = {
    claimPending: async (orderId) => {
      calls.claim += 1;
      return {
        claimed: true,
        notificationId: `note_${orderId}`,
        status: "IN_PROGRESS",
      };
    },
    markSent: async () => {
      calls.sent += 1;
    },
    markFailed: async () => {
      calls.failed += 1;
    },
    markNeedsReview: async () => {
      calls.review += 1;
    },
    send: async (message) => {
      lastMessage = message;
      return outcome;
    },
  };
  return { deps, calls, message: () => lastMessage };
}

(async () => {
  // ── 1. Environment-driven ids ──────────────────────────────────────────────
  {
    assert.deepEqual(readTemplateIds({}), {}, "no env → no templates configured");

    const ids = readTemplateIds({
      [EMAIL_TEMPLATE_ENV.passwordReset]: "  tpl_pw  ",
      [EMAIL_TEMPLATE_ENV.contactInquiry]: "tpl_contact",
      [EMAIL_TEMPLATE_ENV.repairRequest]: "tpl_repair",
      [EMAIL_TEMPLATE_ENV.emailVerification]: "tpl_verify",
      [EMAIL_TEMPLATE_ENV.shopOrderPaid]: "",
      [EMAIL_TEMPLATE_ENV.modsOrderPaid]: "   ",
    });
    assert.equal(ids.passwordReset, "tpl_pw", "ids are trimmed");
    assert.equal(ids.contactInquiry, "tpl_contact");
    assert.equal(ids.repairRequest, "tpl_repair");
    assert.equal(ids.emailVerification, "tpl_verify");
    assert.equal(ids.shopOrderPaid, undefined, "blank id is unconfigured");
    assert.equal(ids.modsOrderPaid, undefined, "whitespace id is unconfigured");

    pass("template ids come from env; blank/missing ids are unconfigured");
  }

  // ── 2. Password reset: Better Auth URL delivered, never generated here ─────
  {
    const url = "https://keebforge.in/reset-password?token=abc&callbackURL=%2F";
    const payload = passwordResetEmail({ name: "Ada", resetUrl: url });
    assert.equal(payload.subject, "Reset your KeebForge password");
    assert.equal(
      payload.variables.resetUrl,
      url,
      "the trusted reset URL is passed through unchanged",
    );
    assert.equal(payload.variables.name, "Ada");
    assert.equal(payload.variables.expiresIn, "1 hour");

    const ref = templateRef("tpl_pw", payload);
    assert.equal(ref.template.id, "tpl_pw");
    assert.equal(ref.template.variables.resetUrl, url);

    pass("password reset: template carries the Better Auth reset URL unchanged");
  }

  // ── 2b. Verification: the verify URL is delivered unchanged ────────────────
  {
    const url = "https://keebforge.in/api/auth/verify-email?token=xyz";
    const payload = verificationEmail({ name: "Ada", verifyUrl: url });
    assert.equal(payload.subject, "Verify your KeebForge email");
    assert.equal(payload.variables.verifyUrl, url);
    assert.equal(payload.variables.expiresIn, "1 hour");
    pass("verification: template carries the Better Auth verify URL unchanged");
  }

  // ── 3. Contact inquiry: photo list pre-escaped, recipient untouched ────────
  {
    const base = {
      name: "Sam",
      phone: "9876543210",
      email: "sam@example.org",
      deviceModel: "Test Board",
      issue: "Does not power on.",
    };

    const payload = contactInquiryEmail({
      ...base,
      photoUrls: ["https://cdn.example/a.jpg?x=1&y=2", "bad<url>"],
    });
    assert.equal(payload.variables.photosCount, "2");
    assert.equal(payload.variables.name, "Sam");
    assert.equal(payload.variables.customerEmail, "sam@example.org");
    const photosHtml = String(payload.variables.photosHtml);
    assert.ok(photosHtml.includes("Photos (2)"));
    assert.ok(photosHtml.includes("&amp;y=2"), "photo URL is escaped");
    assert.ok(!photosHtml.includes("<url>"), "metacharacters in URL are neutralised");

    const noPhotos = contactInquiryEmail({ ...base, photoUrls: [] });
    assert.equal(noPhotos.variables.photosHtml, "");
    assert.equal(noPhotos.variables.photosCount, "0");

    pass("contact inquiry: template gets an escaped photos fragment");
  }

  // ── 3b. Repair request: every field becomes a flat variable ────────────────
  {
    const payload = repairRequestEmail({
      reference: "KF-2026-000789",
      serviceType: "Repair",
      deviceType: "Keyboard",
      brand: "Keychron",
      model: "Q1",
      workTypes: "Soldering, Lubing",
      condition: "Used",
      budget: "₹2,000",
      description: "Sticky keys",
      name: "Sam",
      phone: "9876543210",
      email: "sam@example.org",
      contactNotes: "—",
      shipping: "Ship to KeebForge",
      photoUrls: ["https://cdn.example/p.jpg"],
    });
    assert.match(payload.subject, /KF-2026-000789/);
    assert.equal(payload.variables.reference, "KF-2026-000789");
    assert.equal(payload.variables.workTypes, "Soldering, Lubing");
    assert.equal(payload.variables.customerEmail, "sam@example.org");
    assert.ok(String(payload.variables.photosHtml).includes("Photos (1)"));
    pass("repair request: fields map to flat template variables");
  }

  // ── 4. Shop / mods builders: configured template or nothing ────────────────
  {
    assert.equal(
      buildShopPaidConfirmation(shopOrder).template,
      undefined,
      "shop: no id → no template",
    );
    const shop = buildShopPaidConfirmation(shopOrder, { shopOrderPaid: "tpl_shop" });
    assert.equal(shop.template?.id, "tpl_shop");
    assert.equal(shop.template?.variables.orderNumber, "KF-2026-000123");
    assert.equal(shop.template?.variables.customerName, "Ada <Lovelace>");
    assert.ok(
      String(shop.template?.variables.itemsHtml).includes("&lt;TKL&gt;"),
      "the pre-rendered items fragment escapes customer input",
    );
    assert.ok(
      String(shop.template?.variables.totalsHtml).includes("Total paid"),
      "the pre-rendered totals fragment is present",
    );

    assert.equal(
      buildModsPaidConfirmation(modsOrder).template,
      undefined,
      "mods: no id → no template",
    );
    const mods = buildModsPaidConfirmation(modsOrder, { modsOrderPaid: "tpl_mods" });
    assert.equal(mods.template?.id, "tpl_mods");
    assert.equal(
      mods.template?.variables.shippingMethod,
      "You ship your device to KeebForge (Express)",
    );
    assert.equal(
      mods.template?.variables.shippingAddress,
      "Flat 4B, Lake View, Bengaluru, Karnataka 560001",
    );
    assert.ok(String(mods.template?.variables.amountPaid).includes("₹"));
    assert.ok(String(mods.template?.variables.configHtml).includes("Wooting"));
    assert.ok(String(mods.template?.variables.servicesHtml).includes("Gasket mount install"));

    // Dispatch still picks the right builder AND the right template id.
    assert.equal(
      buildPaidConfirmation(shopOrder, { shopOrderPaid: "tpl_shop" }).template?.id,
      "tpl_shop",
    );
    assert.equal(
      buildPaidConfirmation(modsOrder, { modsOrderPaid: "tpl_mods" }).template?.id,
      "tpl_mods",
    );

    pass("shop/mods builders attach the configured template, or none");
  }

  // ── 5. Shared escaper is single-sourced ────────────────────────────────────
  {
    assert.equal(
      esc(`<script>alert("x")&<'</script>`),
      "&lt;script&gt;alert(&quot;x&quot;)&amp;&lt;&#39;&lt;/script&gt;",
    );
    pass("the canonical escaper neutralises every HTML metacharacter");
  }

  // ── 6. State machine: template rides along, outcome still decides ──────────
  {
    const templates = { shopOrderPaid: "tpl_shop", modsOrderPaid: "tpl_mods" };

    const accepted = fakeDeps({ kind: "accepted", providerMessageId: "re_1" });
    let result = await runPaidConfirmation(accepted.deps, shopOrder, templates);
    assert.equal(result.status, "sent", "accepted → sent");
    assert.equal(accepted.calls.sent, 1);
    assert.equal(
      accepted.message()?.template?.id,
      "tpl_shop",
      "the configured template reaches the transport",
    );

    const rejected = fakeDeps({ kind: "rejected", reason: "resend:validation_error:422" });
    result = await runPaidConfirmation(rejected.deps, shopOrder, templates);
    assert.equal(result.status, "failed", "definitive 4xx → failed (retryable)");
    assert.equal(rejected.calls.failed, 1);
    assert.equal(rejected.calls.sent, 0);

    const ambiguous = fakeDeps({ kind: "ambiguous", reason: "resend:threw" });
    result = await runPaidConfirmation(ambiguous.deps, modsOrder, templates);
    assert.equal(result.status, "needs-review", "ambiguous → needs-review");
    assert.equal(ambiguous.calls.review, 1);
    assert.equal(ambiguous.calls.sent, 0);
    assert.equal(ambiguous.message()?.template?.id, "tpl_mods");

    // With no template configured the message carries no template; the transport
    // (not this pure core) is what turns that into a definitive failure.
    const noTemplates = fakeDeps({ kind: "accepted", providerMessageId: "re_2" });
    result = await runPaidConfirmation(noTemplates.deps, shopOrder);
    assert.equal(result.status, "sent");
    assert.equal(noTemplates.message()?.template, undefined, "no id → no template");

    // An unpaid order is skipped before any claim or send, template or not.
    const unpaid = fakeDeps({ kind: "accepted", providerMessageId: "re_3" });
    result = await runPaidConfirmation(
      unpaid.deps,
      { ...shopOrder, paymentStatus: "PENDING" },
      templates,
    );
    assert.equal(result.status, "skipped");
    assert.equal(unpaid.calls.claim, 0, "never claims an unpaid order");
    assert.equal(unpaid.message(), null, "never sends for an unpaid order");

    pass("state machine unchanged; template only rides along on the message");
  }

  console.log(`\nPASS all ${n} email template checks`);
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
