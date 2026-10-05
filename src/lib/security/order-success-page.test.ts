/**
 * Focused security test for /order/success/[orderNumber].
 *
 * Needs a running server against the disposable e2e database.
 *
 * DO NOT SOURCE AN ENV FILE INTO THE SHELL. The previous instructions here
 * turned on shell export-all mode and then dot-sourced the whole of `.env.e2e`,
 * which leaked DIRECT_URL into every subsequent command in that terminal and
 * trusted the operator to have sourced it correctly. Neither the mode flag nor
 * the dot-source line is reproduced here, so neither can be copied out of this
 * comment and run. They are replaced by the guarded runner, which validates both
 * connection variables against the loopback allowlist and pins them before this
 * module is loaded:
 *
 *   cp .env.e2e.local.example .env.e2e.local   # once; dummy loopback values
 *   npm run db:scratch:deploy -- --database keebforge_e2e   # once, when needed
 *
 *   # terminal 1 — server on the disposable database
 *   E2E_CALL_LOG=/tmp/opencode/os-page-calls.log npm run e2e:server
 *
 *   # terminal 2 — the test
 *   npm run e2e:order-success-page
 *
 * Running this file directly by path (`npx tsx src/lib/security/order-success-page
 * .test.ts`) refuses. The `import { PrismaClient }` below is hoisted, so this
 * module cannot pin an environment before it; `assertLocalEnvApplied` therefore
 * re-validates the live environment before the client is constructed, and a
 * process whose connection variables came from `.env` — that is, production —
 * is rejected before any query is issued.
 *
 * Why this fetches real HTML instead of unit-testing a predicate: the defect was
 * PII in the rendered page. Only fetching the actual document proves it is gone
 * — a fake order object can never catch a JSX branch that prints
 * `order.customerEmail`. The authorization rule itself is one boolean OR and is
 * already covered by test 35 in pay-inline-capability.test.ts, which asserts the
 * identical capability-or-owning-session predicate.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Module from "node:module";
import { PrismaClient } from "@prisma/client";

import { assertLocalEnvApplied } from "../../../scripts/e2e/local-env";

type SendArgs = { to?: unknown; subject?: unknown; html?: unknown };
// An array, not a variable: the assignment happens inside the stub, so a plain
// `let` would be narrowed to `null` by control-flow analysis at every use.
const captured: SendArgs[] = [];

/**
 * Capture the confirmation email in-process instead of sending it. package.json
 * is CommonJS, so under tsx the email module's `import { Resend } from "resend"`
 * resolves through Module._load and a local override intercepts it. Defined here
 * rather than in a shared require hook so this test stays self-contained and
 * makes no network call.
 */
function installResendCapture() {
  const mod = Module as unknown as {
    _load: (
      this: unknown,
      request: string,
      parent: unknown,
      main: boolean,
    ) => unknown;
    __osCapture?: boolean;
  };
  if (mod.__osCapture) return;
  const orig = mod._load;
  const Stub = class {
    emails = {
      send: async (args: SendArgs) => {
        captured.push(args);
        return { data: { id: "test-email" }, error: null };
      },
    };
  };
  mod._load = function (request, parent, main) {
    if (request === "resend") return { Resend: Stub, default: Stub };
    return orig.call(this, request, parent, main);
  };
  mod.__osCapture = true;
}

/**
 * The server under test must also be local.
 *
 * `SUCCESS_E2E_URL` exists only to vary the port. Allowing it to name a remote
 * host would let this file — which writes real rows — send its traffic, and its
 * seeded data, somewhere off-box, so the host is pinned to loopback.
 */
const BASE = (() => {
  const configured = process.env.SUCCESS_E2E_URL ?? "http://127.0.0.1:3111";
  const { hostname } = new URL(configured);
  if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
    throw new Error(
      `SUCCESS_E2E_URL must point at a loopback address, but it names ${hostname}. ` +
        "This test writes rows to whatever the server uses; it must be the local one.",
    );
  }
  return configured;
})();

// Every marker below is a value that exists on exactly one order and nowhere
// else in the database, so "is it in the response?" is unambiguous.
const M = {
  aName: "SECRET_NAME_ALPHA",
  aEmail: "registered@secrettest.invalid",
  aStreet: "SECRET_STREET_ALPHA",
  aCity: "SECRET_CITY_ALPHA",
  aPhone: "+919111100001",
  aPin: "111001",
  aItem: "SECRET_ITEM_ALPHA",
  aModel: "SECRET_MODEL_ALPHA",
  aPay: "pay_SECRET_ALPHA",
  aTotal: "1,111",
  bName: "SECRET_NAME_BETA",
  bEmail: "unregistered@secrettest.invalid",
  bStreet: "SECRET_STREET_BETA",
  bCity: "SECRET_CITY_BETA",
  bPhone: "+919111100002",
  bPin: "222002",
  bItem: "SECRET_ITEM_BETA",
  cName: "SECRET_NAME_DELETED",
  cEmail: "deleted@secrettest.invalid",
  cStreet: "SECRET_STREET_DELETED",
  cItem: "SECRET_ITEM_DELETED",
};

const NUM_A = "SECPAGE1";
const NUM_B = "SECPAGE2";
const NUM_C = "SECPAGE3";
const OWNER_EMAIL = "owner@secrettest.invalid";
const OTHER_EMAIL = "other@secrettest.invalid";
const MATCH_EMAIL = M.aEmail; // registered account that does NOT own order A

// Fields an unauthorized visitor must never see.
const PII_MARKERS = [
  M.aName,
  M.aEmail,
  M.aStreet,
  M.aCity,
  M.aPin,
  M.aItem,
  M.aModel,
  M.aPay,
  M.bName,
  M.bEmail,
  M.bStreet,
  M.bCity,
  M.bPhone,
  M.bItem,
  M.cName,
  M.cEmail,
  M.cStreet,
  M.cItem,
];

// Refuses unless DATABASE_URL and DIRECT_URL are already pinned to an approved
// loopback scratch database. When started via `npm run e2e:order-success-page`
// the runner has already applied and validated them; when started directly,
// `@prisma/client`'s hoisted import has loaded `.env` and these are production
// values, so this throws and the process exits before any query runs. Placed
// immediately above the constructor so nothing can construct a client first.
assertLocalEnvApplied();

const prisma = new PrismaClient();
const hash = (t: string) =>
  crypto.createHash("sha256").update(t, "utf8").digest("hex");
const capA = "A".repeat(43);
const capB = "B".repeat(43);
// Distinct codes per case so no test depends on another's leftovers.
const codeB = "C".repeat(43);
const codeC = "D".repeat(43);
const codeD = "E".repeat(43);
const codeE = "F".repeat(43);

/** The payment capability rides in the HttpOnly cookie, never the URL. */
const payCookie = (token: string) => `kf_pay=${token}`;
const capACookie = `${payCookie(capA)}; kf_cart=anything`;

type Res = { status: number; body: string; headers: Headers };

async function hit(
  path: string,
  cookie?: string,
): Promise<Res> {
  const r = await fetch(`${BASE}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  });
  return { status: r.status, body: await r.text(), headers: r.headers };
}

/** Re-arm B with a fresh, live exchange code so each case starts unspent. */
async function armExchange(
  orderNumber: string,
  code: string,
  ttlMs = 7 * 24 * 60 * 60 * 1000,
) {
  await prisma.order.update({
    where: { orderNumber },
    data: {
      billingDetails: {
        guestPaymentTokenHash: hash(capB),
        guestPaymentExchangeTokenHash: hash(code),
        guestPaymentExchangeExpiresAt: Date.now() + ttlMs,
        guestPaymentExchangeState: "redeemable",
      },
    },
  });
}

/** Current billingDetails of a seeded order, for asserting on side effects. */
function billingOf(orderNumber: string): Promise<Record<string, unknown>> {
  return prisma.order
    .findUniqueOrThrow({ where: { orderNumber } })
    .then((o) => (o.billingDetails ?? {}) as Record<string, unknown>);
}

/** Merge a patch into billingDetails the way pay-inline's route does. */
async function patchBilling(
  orderNumber: string,
  patch: Record<string, string | number | null>,
) {
  const current = await billingOf(orderNumber);
  const next: Record<string, unknown> = { ...current };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete next[k];
    else next[k] = v;
  }
  await prisma.order.update({
    where: { orderNumber },
    data: { billingDetails: next as never },
  });
}

/** POST an exchange code the way the interstitial's Continue button does. */
async function exchange(
  orderNumber: string,
  code: string,
): Promise<{ status: number; cookie: string | null; body: string }> {
  const r = await fetch(`${BASE}/api/payments/exchange`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ orderNumber, code }),
    redirect: "manual",
  });
  const setCookie = (r.headers.getSetCookie?.() ?? []).find((c) =>
    c.startsWith("kf_pay="),
  );
  return {
    status: r.status,
    cookie: setCookie ? setCookie.split(";")[0] : null,
    body: await r.text(),
  };
}

const has = (body: string, needle: string) => body.includes(needle);

/** Minimal cookie jar: Better Auth's session cookie name is an implementation
 *  detail, so keep whatever the server sets. `origin` is required — Better Auth
 *  answers MISSING_OR_NULL_ORIGIN (403) for a CORS-shaped request without it. */
async function signUp(email: string): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({
      email,
      password: "Str0ng-Pass-1234",
      name: "Sec Test",
    }),
  });
  assert.equal(r.status, 200, `sign-up failed for ${email}: ${r.status}`);
  const jar = (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0])
    .join("; ");
  assert.ok(jar, `no session cookie for ${email}`);
  return jar;
}

async function cleanup() {
  await prisma.order.deleteMany({
    where: { orderNumber: { in: [NUM_A, NUM_B, NUM_C] } },
  });
  const users = await prisma.user.findMany({
    where: {
      email: { in: [OWNER_EMAIL, OTHER_EMAIL, MATCH_EMAIL] },
    },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.account.deleteMany({ where: { userId: { in: ids } } });
  await prisma.profile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

async function seed() {
  await cleanup();

  // A — PAID, owned by OWNER_EMAIL, but customerEmail is a *different*
  // registered account (MATCH_EMAIL) so email-ownership confusion is testable.
  await prisma.order.create({
    data: {
      orderNumber: NUM_A,
      type: "PRODUCT",
      status: "PAYMENT_RECEIVED",
      paymentStatus: "PAID",
      customerName: M.aName,
      customerEmail: M.aEmail,
      customerPhone: M.aPhone,
      subtotal: 111_100,
      total: 111_100,
      billingDetails: { guestPaymentTokenHash: hash(capA) },
      summary: { deviceType: "KEYBOARD", brand: "SECRET_BRAND", model: M.aModel },
      shippingAddress: {
        create: {
          streetAddress: M.aStreet,
          city: M.aCity,
          state: "Jammu and Kashmir",
          postalCode: M.aPin,
          country: "India",
          phone: M.aPhone,
        },
      },
      items: {
        create: {
          name: M.aItem,
          quantity: 1,
          unitPrice: 111_100,
          lineTotal: 111_100,
        },
      },
      payments: {
        create: {
          amount: 111_100,
          status: "PAID",
          method: "card",
          razorpayOrderId: "order_E2E_SEC_A",
          razorpayPaymentId: M.aPay,
          paidAt: new Date(),
        },
      },
    },
  });

  // B — PENDING and unowned, so the Pay button is reachable and a guest
  // capability is the only thing that can unlock it.
  await prisma.order.create({
    data: {
      orderNumber: NUM_B,
      type: "PRODUCT",
      status: "ORDER_RECEIVED",
      paymentStatus: "PENDING",
      customerName: M.bName,
      customerEmail: M.bEmail,
      customerPhone: M.bPhone,
      subtotal: 222_200,
      total: 222_200,
      billingDetails: { guestPaymentTokenHash: hash(capB) },
      shippingAddress: {
        create: {
          streetAddress: M.bStreet,
          city: M.bCity,
          state: "Maharashtra",
          postalCode: M.bPin,
          country: "India",
          phone: M.bPhone,
        },
      },
      items: {
        create: {
          name: M.bItem,
          quantity: 2,
          unitPrice: 111_100,
          lineTotal: 222_200,
        },
      },
    },
  });

  // C — soft-deleted. Must be indistinguishable from a number that never existed.
  await prisma.order.create({
    data: {
      orderNumber: NUM_C,
      type: "PRODUCT",
      customerName: M.cName,
      customerEmail: M.cEmail,
      customerPhone: "+919111100003",
      subtotal: 333_300,
      total: 333_300,
      isDeleted: true,
      shippingAddress: {
        create: {
          streetAddress: M.cStreet,
          city: "SECRET_CITY_DELETED",
          state: "Kerala",
          postalCode: "333003",
          country: "India",
        },
      },
      items: {
        create: {
          name: M.cItem,
          quantity: 1,
          unitPrice: 333_300,
          lineTotal: 333_300,
        },
      },
    },
  });
}

/** Link order A to the owner's profile. Profiles are provisioned lazily on the
 *  first authenticated request, so hit the page once with the session first. */
async function attachOwner(ownerCookie: string) {
  await hit(`/order/success/${NUM_A}`, ownerCookie);
  const user = await prisma.user.findUnique({
    where: { email: OWNER_EMAIL },
    include: { profile: true },
  });
  assert.ok(user?.profile, "owner profile was not provisioned");
  await prisma.order.update({
    where: { orderNumber: NUM_A },
    data: { profileId: user.profile.id },
  });
  return user.profile.id;
}

function assertNoPii(body: string, label: string) {
  for (const marker of PII_MARKERS) {
    assert.equal(
      has(body, marker),
      false,
      `${label}: LEAKED ${marker} to an unauthorized visitor`,
    );
  }
  // Account-existence oracle: the old copy told anonymous visitors that the
  // email was known to KeebForge.
  for (const phrase of [
    "Sign in or create an account",
    "with this email to get the full order view",
  ]) {
    assert.equal(has(body, phrase), false, `${label}: enumeration copy ${phrase}`);
  }
}

(async () => {
  try {
    const probe = await fetch(`${BASE}/`, { redirect: "manual" }).catch(
      () => null,
    );
    assert.ok(
      probe,
      `no server at ${BASE} — start one per the header comment of this file`,
    );
  } catch {
    throw new Error(
      `no server at ${BASE} — start one per the header comment of this file`,
    );
  }

  await seed();
  const ownerCookie = await signUp(OWNER_EMAIL);
  const otherCookie = await signUp(OTHER_EMAIL);
  const matchCookie = await signUp(MATCH_EMAIL);
  await attachOwner(ownerCookie);

  const path = `/order/success/${NUM_A}`;

  // ── 1–4  guest capability matrix on order A ───────────────────────────
  {
    // Clean URL — the page must never need a query parameter to authorize.
    const withCap = await hit(path, capACookie);
    assert.equal(withCap.status, 200);
    for (const m of [M.aName, M.aStreet, M.aCity, M.aItem, M.aPay, M.aEmail])
      assert.ok(has(withCap.body, m), `1: authorized guest missing ${m}`);
    // The capability must not be echoed back into the HTML or headers.
    assert.equal(
      has(withCap.body, capA),
      false,
      "1: capability leaked into the rendered page",
    );
    assert.ok(
      ![...withCap.headers.entries()].some(([, v]) => v.includes(capA)),
      "1: capability leaked into a response header",
    );
    console.log("PASS 1  guest + valid cookie -> full authorized view, no echo");

    const noCap = await hit(path);
    assert.equal(noCap.status, 200, "unauthorized page must still render");
    assertNoPii(noCap.body, "2");
    assert.ok(has(noCap.body, NUM_A), "2: order number should still be shown");
    assert.ok(
      has(noCap.body, "This page shows full order details only"),
      "2: expected the limited-view copy",
    );
    console.log("PASS 2  guest, no cookie -> limited view, no PII");

    const junk = await hit(path, payCookie("Z".repeat(43)));
    assert.equal(junk.status, 200);
    assertNoPii(junk.body, "3");
    console.log("PASS 3  guest + invalid cookie -> limited view, no PII");

    // Order B's capability presented against order A must not unlock A.
    const cross = await hit(path, payCookie(capB));
    assert.equal(cross.status, 200);
    assertNoPii(cross.body, "4");
    console.log("PASS 4  guest + OTHER order's capability -> limited view");

    // The retired `?pay=` parameter is now inert — a leaked old link cannot
    // re-open anything.
    const legacy = await hit(`${path}?pay=${capA}`);
    assert.equal(legacy.status, 200);
    assertNoPii(legacy.body, "4b");
    console.log("PASS 4b ?pay= is ignored — no credential travels in the URL");
  }

  // ── 5–6  authenticated owner vs non-owner ────────────────────────────
  {
    const owner = await hit(path, ownerCookie);
    assert.equal(owner.status, 200);
    for (const m of [M.aName, M.aStreet, M.aCity, M.aItem, M.aPay])
      assert.ok(has(owner.body, m), `5: owner missing ${m}`);
    console.log("PASS 5  authenticated owner -> full authorized view");

    const stranger = await hit(path, otherCookie);
    assert.equal(stranger.status, 200);
    assertNoPii(stranger.body, "6");
    console.log("PASS 6  authenticated NON-owner -> limited view, no PII");
  }

  // ── 7–8  unknown and soft-deleted ─────────────────────────────────────
  {
    const unknown = await hit("/order/success/KFZZZZZZZZ");
    assert.equal(unknown.status, 404, "unknown order number must 404");

    const deleted = await hit(`/order/success/${NUM_C}`);
    assert.equal(
      deleted.status,
      404,
      `soft-deleted order must 404, got ${deleted.status}`,
    );
    assertNoPii(deleted.body, "8");
    // The real property: a soft-deleted order must be indistinguishable from a
    // number that never existed. No separate "deleted" response, no order data.
    // (The caller's own number may appear in the RSC router payload; that is the
    // URL they typed, not a disclosure.)
    const strip = (h: string) =>
      h.split("KFZZZZZZZZ").join("X").split(NUM_C).join("X");
    assert.equal(
      strip(deleted.body),
      strip(unknown.body),
      "soft-deleted 404 differs from unknown-order 404",
    );
    console.log("PASS 7  unknown order number -> 404");
    console.log(
      "PASS 8  soft-deleted order -> 404, byte-identical to unknown",
    );
  }

  // ── 9–17  PII absence on order B, whose email has NO KeebForge account ─
  {
    const b = await hit(`/order/success/${NUM_B}`);
    assert.equal(b.status, 200);
    assertNoPii(b.body, "9-17");
    assert.ok(has(b.body, M.bPhone) === false, "11: phone leaked");
    assert.ok(has(b.body, M.bPin) === false, "12: address leaked");
    assert.ok(!/\b2,222\b/.test(b.body), "14: total leaked");
    console.log("PASS 9-16 unauthorized view exposes no PII or financial data");
    console.log("PASS 17 no account-existence wording for any visitor");
  }

  // ── 4b  email-registered but not the owner ────────────────────────────
  {
    // A's customerEmail belongs to a real account that does not own A. Owning
    // must follow profileId, never the email on the order.
    const r = await hit(path, matchCookie);
    assert.equal(r.status, 200);
    assertNoPii(r.body, "4b");
    console.log("PASS 6b account matching order email, not owner -> limited");
  }

  // ── 18–19  Pay button still gated by the capability ───────────────────
  {
    const entitled = await hit(`/order/success/${NUM_B}`, payCookie(capB));
    assert.ok(has(entitled.body, "os-pay-now"), "18: Pay button missing");
    console.log("PASS 18 valid capability still renders the Pay button");

    const wrong = await hit(`/order/success/${NUM_B}`, payCookie(capA));
    assert.equal(wrong.status, 200);
    assert.ok(
      !has(wrong.body, "os-pay-now"),
      "19: cross-order capability rendered a Pay button",
    );
    // A rejected capability now drops to the limited tier, so the payment block
    // is absent entirely — not just the button.
    assert.ok(
      !has(wrong.body, "Open the payment link from your confirmation email"),
      "19: payment block rendered for a rejected capability",
    );
    assertNoPii(wrong.body, "19");
    console.log(
      "PASS 19 cross-order capability: no Pay button, no payment block",
    );
  }

  // ── 20  pay-inline authorization unchanged ────────────────────────────
  {
    // The body carries only the order number. The capability can only arrive as
    // the HttpOnly cookie, so a cross-site caller cannot present it.
    const post = async (orderNumber: string, cookie?: string) => {
      const r = await fetch(`${BASE}/api/payments/pay-inline`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ orderNumber }),
      });
      return { status: r.status, body: await r.text() };
    };

    // Everything below uses PAID order A on purpose: `paymentStatus === "PAID"`
    // is checked *before* any gateway call, so a 400 "already paid" is only
    // reachable after the authorization gate passed. That makes the full
    // entitlement matrix observable with zero outbound requests. The happy-path
    // Razorpay flow is already covered by pay-inline-capability.test.ts against
    // injected fake deps (tests 1, 29, 30, 31).
    const entitled = await post(NUM_A, payCookie(capA));
    assert.equal(
      entitled.status,
      400,
      "pay-inline stopped honouring a valid cookie",
    );
    assert.ok(/already paid/i.test(entitled.body), entitled.body.slice(0, 120));

    // A capability smuggled into the body must be ignored outright.
    const smuggled = await fetch(`${BASE}/api/payments/pay-inline`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderNumber: NUM_A, capabilityToken: capA }),
    });
    assert.equal(
      smuggled.status,
      404,
      "pay-inline honoured a body-supplied capability",
    );

    // Wrong order's cookie, no cookie, unknown order, non-owner session: all
    // rejected identically so the endpoint stays a non-oracle.
    assert.equal((await post(NUM_A, payCookie(capB))).status, 404);
    assert.equal((await post(NUM_A)).status, 404);
    assert.equal((await post("KFZZZZZZZZ", payCookie(capA))).status, 404);
    assert.equal((await post(NUM_A, otherCookie)).status, 404);
    assert.equal((await post(NUM_A, matchCookie)).status, 404);

    // Owning session entitled without a capability.
    const byOwner = await post(NUM_A, ownerCookie);
    assert.equal(
      byOwner.status,
      400,
      "pay-inline stopped recognizing the owning session",
    );
    assert.ok(/already paid/i.test(byOwner.body));

    // An entitled PENDING order must NOT be rejected as unauthorized. (Its body
    // is not asserted: the gateway call itself is out of scope for a local test.)
    const pending = await post(NUM_B, payCookie(capB));
    assert.notEqual(
      pending.status,
      404,
      "entitled pending order was rejected by the authorization gate",
    );
    console.log("PASS 20 pay-inline authorization behaviour unchanged");
  }

  // ── 21–23  SEO ────────────────────────────────────────────────────────
  {
    const authorized = await hit(path, capACookie);
    const head = authorized.body.split("</head>")[0];
    assert.ok(
      /<meta name="robots" content="noindex, nofollow"\s*\/?>/.test(head),
      "21: noindex not emitted",
    );
    // No order data in any crawler/social surface.
    for (const field of ["<title>", 'name="description"', 'property="og:title"', 'property="og:description"', 'name="twitter:title"']) {
      const m = head.match(new RegExp(`${field}[^>]*>([^<]*)<`));
      const value = m?.[1] ?? "";
      for (const marker of [NUM_A, M.aName, M.aEmail, M.aItem, M.aPay])
        assert.equal(
          has(value, marker),
          false,
          `22: ${marker} leaked into ${field}`,
        );
    }
    // Canonical stays self-referencing; noindex is what stops indexing.
    assert.ok(
      head.includes(`<link rel="canonical" href="https://keebforge.in/order/success/${NUM_A}"`),
      "23: canonical should stay self-referencing",
    );
    const sitemap = await hit("/sitemap.xml");
    assert.ok(
      !has(sitemap.body, "/order/success"),
      "23: sitemap contains order success URLs",
    );
    assert.ok(!has(sitemap.body, NUM_A), "23: sitemap contains an order number");
    console.log("PASS 21 success page emits noindex, nofollow");
    console.log("PASS 22 no order data in title/description/og/twitter");
    console.log("PASS 23 canonical self-referencing, sitemap has no orders");
  }

  // ── 24–25  cache headers ──────────────────────────────────────────────
  {
    for (const [label, r] of [
      ["authorized", await hit(path, capACookie)],
      ["unauthorized", await hit(path)],
    ] as const) {
      const cc = (r.headers.get("cache-control") ?? "").toLowerCase();
      for (const directive of ["private", "no-cache", "no-store"])
        assert.ok(cc.includes(directive), `24: ${label} missing ${directive}`);
      assert.ok(!cc.includes("s-maxage"), `24: ${label} is CDN-cacheable`);
      assert.ok(!/\bpublic\b/.test(cc), `24: ${label} is publicly cacheable`);
    }
    // A cacheable response could not differ per visitor; these must differ.
    const a = await hit(path);
    const b = await hit(path, capACookie);
    assert.notEqual(a.body, b.body, "25: responses are identical — check caching");
    console.log("PASS 24 response stays private, no-cache, no-store");
    console.log("PASS 25 no public cache entry; per-visitor responses differ");
  }

  // ── 26  authorized layout intact ──────────────────────────────────────
  {
    const r = await hit(path, capACookie);
    for (const marker of [
      "Delivery Address",
      "Order Summary",
      "What happens next?",
      "Total Paid",
      "Subtotal",
      "Shipping",
    ])
      assert.ok(has(r.body, marker), `26: authorized view lost "${marker}"`);
    console.log("PASS 26 authorized layout and data intact");
  }

  // ── 4c  phone removed from the authorized view too ────────────────────
  {
    const r = await hit(path, capACookie);
    assert.ok(!has(r.body, M.aPhone), "phone still rendered when authorized");
    assert.ok(!has(r.body, "911110001"), "phone digits still rendered");
    console.log("PASS 4c phone absent from the authorized view as well");
  }

  // ── 27–28  the emailed link works end to end, in another browser ───────
  //
  // Built with the real email module and the real Resend payload captured
  // through the stub, then followed exactly as a customer would: land on the
  // interstitial, press Continue, get a cookie, open the order.
  {
    captured.length = 0;
    installResendCapture();
    const { sendGuestOrderConfirmation } = await import(
      "@/lib/payments/order-confirmation-email"
    );
    await sendGuestOrderConfirmation({
      to: M.bEmail,
      orderNumber: NUM_B,
      exchangeCode: codeB,
    });
    assert.equal(captured.length, 1, "27: no confirmation email was produced");
    const html = String(captured[0].html ?? "");
    const link = html.match(/https?:\/\/[^"\\]*\/order\/success\/[^"\\]*/)?.[0];
    assert.ok(link, "27: confirmation email carried no recovery link");
    assert.ok(
      link!.endsWith(`/order/success/${NUM_B}/exchange?code=${codeB}`),
      `27: recovery link shape changed: ${link}`,
    );
    // The capability must never appear in the email.
    assert.equal(
      has(html, capB),
      false,
      "27: the payment capability leaked into the email",
    );

    // Landing on the link renders the interstitial and authorises nothing.
    const landing = await fetch(link!);
    const landingBody = await landing.text();
    assert.equal(landing.status, 200);
    assert.ok(has(landingBody, "Continue to payment"), "27: no Continue button");
    assertNoPii(landingBody, "27");

    // The landing GET spent nothing — arm a fresh code and prove Continue works.
    await armExchange(NUM_B, codeC);
    const first = await exchange(NUM_B, codeC);
    assert.equal(first.status, 200, "27: a landing GET consumed the code");
    const second = await exchange(NUM_B, codeC);
    assert.equal(second.status, 404, "28: exchange code was not single-use");
    assert.equal(second.cookie, null, "28: replay issued a cookie");
    assertNoPii(second.body, "28");
    console.log("PASS 27 email carries an exchange code, GET does not redeem it");
    console.log("PASS 28 the same code cannot be redeemed twice");
  }

  // ── 29–33  the redeemed cookie authorizes the full order ──────────────
  {
    // Redeem in a fresh session (no cookies at all).
    await armExchange(NUM_B, codeD);
    const redeemed = await exchange(NUM_B, codeD);
    assert.equal(redeemed.status, 200, "29: exchange rejected a live code");
    assert.ok(redeemed.cookie, "29: exchange issued no payment cookie");
    assert.match(redeemed.cookie, /^kf_pay=[A-Za-z0-9_-]{43}$/);
    // The response body must not carry the new capability either.
    assert.equal(
      has(redeemed.body, redeemed.cookie.split("=")[1]),
      false,
      "29: capability echoed in the exchange response body",
    );

    // With the cookie, the order page is fully authorized — no PII gate.
    const recovered = await hit(`/order/success/${NUM_B}`, redeemed.cookie!);
    assert.equal(recovered.status, 200);
    for (const m of [M.bName, M.bStreet, M.bCity, M.bItem]) {
      assert.ok(
        has(recovered.body, m),
        `30: redeemed cookie did not authorize the page (${m})`,
      );
    }
    assert.ok(has(recovered.body, "Delivery Address"), "30: limited view");
    assert.ok(has(recovered.body, "os-pay-now"), "30: lost the Pay button");
    // And pay-inline accepts that same cookie.
    const paid = await fetch(`${BASE}/api/payments/pay-inline`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: redeemed.cookie! },
      body: JSON.stringify({ orderNumber: NUM_B }),
    });
    assert.notEqual(paid.status, 404, "30: pay-inline rejected the redeemed cookie");
    console.log("PASS 29 exchange issues a payment cookie and nothing else");
    console.log("PASS 30 the redeemed cookie authorizes page + pay-inline");

    // Cookie hardening, asserted on a dedicated fresh redemption.
    await armExchange(NUM_B, codeE);
    const flags = (
      await fetch(`${BASE}/api/payments/exchange`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: NUM_B, code: codeE }),
      })
    ).headers.getSetCookie?.() ?? [];
    const setCookie = flags.find((c) => c.startsWith("kf_pay="));
    assert.ok(setCookie, "29b: no Set-Cookie header");
    assert.ok(/HttpOnly/i.test(setCookie!), "29b: cookie is not HttpOnly");
    assert.ok(/SameSite=Lax/i.test(setCookie!), "29b: cookie is not SameSite=Lax");
    assert.ok(/Path=\//i.test(setCookie!), "29b: cookie Path is not /");
    assert.ok(
      /Max-Age=2592000/i.test(setCookie!),
      `29b: cookie has no bounded Max-Age: ${setCookie}`,
    );
    console.log("PASS 29b cookie is HttpOnly, Lax, Path=/, Max-Age bounded");
  }

  // ── 31  independent paths: redeeming in browser 2 keeps browser 1 working
  {
    // capB is browser 1's cookie from create-order; browser 2 just redeemed
    // codeB above and now holds its own capability.
    const browser1 = await hit(`/order/success/${NUM_B}`, payCookie(capB));
    assert.ok(
      has(browser1.body, "os-pay-now"),
      "31: redeeming the email link invalidated the checkout browser's cookie",
    );
    const stillPays = await fetch(`${BASE}/api/payments/pay-inline`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: payCookie(capB) },
      body: JSON.stringify({ orderNumber: NUM_B }),
    });
    assert.notEqual(stillPays.status, 404, "31: browser 1 lost payment access");
    console.log(
      "PASS 31 both entry points stay independently valid after redemption",
    );
  }

  // ── 32–35  exchange failures are indistinguishable ────────────────────
  {
    await armExchange(NUM_B, codeB, -1000);
    const expired = await exchange(NUM_B, codeB);
    const unknownOrder = await exchange("KFZZZZZZZZ", codeB);
    const wrongCode = await exchange(NUM_B, "Z".repeat(43));
    const malformedCode = await exchange(NUM_B, "short");
    const noCode = await exchange(NUM_B, undefined as unknown as string);

    assert.equal(expired.status, 404, "32: expired code was accepted");
    assert.equal(expired.cookie, null, "32: expired code issued a cookie");
    // Every failure is byte-identical: no oracle for order or code existence.
    for (const r of [unknownOrder, wrongCode, malformedCode, noCode]) {
      assert.equal(r.status, expired.status, "32: failure statuses differ");
      assert.equal(r.body, expired.body, "32: failure bodies differ");
      assert.equal(r.cookie, null, "32: a failure issued a cookie");
    }
    assert.equal(
      has(expired.body, NUM_B),
      false,
      "32: failure response echoed the order number",
    );
    assertNoPii(expired.body, "32");
    console.log("PASS 32 expired code rejected, no cookie issued");
    console.log(
      "PASS 33-35 unknown order / wrong / malformed / missing code are identical",
    );

    // GET on the endpoint must not exist — a link scanner cannot spend a code.
    const get = await fetch(`${BASE}/api/payments/exchange`, {
      redirect: "manual",
    });
    assert.ok(get.status === 404 || get.status === 405, "36: GET is accepted");
    console.log("PASS 36 exchange has no GET handler");
  }

  // ── 37  the interstitial renders no Razorpay script ───────────────────
  {
    const landing = await fetch(
      `${BASE}/order/success/${NUM_B}/exchange?code=${"G".repeat(43)}`,
    );
    const body = await landing.text();
    assert.ok(!/checkout\.razorpay\.com/i.test(body), "37: Razorpay script loaded");
    assert.ok(!/razorpay/i.test(body), "37: Razorpay referenced on interstitial");
    assertNoPii(body, "37");
    console.log("PASS 37 interstitial loads no Razorpay code");
  }

  // ── 40–44  redemption survives concurrent billing writes ──────────────
  //
  // Regression guard for a lost-update bug: billingDetails is one JSONB blob and
  // Prisma's `data: { billingDetails }` replaces the whole document, so a
  // pay-inline write landing between a redemption's read and its write reverted
  // the redemption — the spent code came back to life and the freshly minted
  // capability vanished. Both writers now touch only their own paths.
  {
    // 40: a Razorpay-field write after redemption does not resurrect the code.
    const codeF = crypto.randomBytes(32).toString("base64url");
    await armExchange(NUM_B, codeF);
    const redeemedF = await exchange(NUM_B, codeF);
    assert.equal(redeemedF.status, 200, "40: live code rejected");
    const mintedF = redeemedF.cookie!.split("=")[1];

    await patchBilling(NUM_B, {
      razorpayOrderId: "order_rzp_concurrent",
      razorpayOrderAmount: 100_000,
    });

    const afterPatch = await billingOf(NUM_B);
    assert.equal(
      afterPatch.guestPaymentExchangeTokenHash,
      hash(mintedF),
      "40: concurrent billing write clobbered the minted capability",
    );
    assert.equal(
      afterPatch.guestPaymentExchangeExpiresAt,
      undefined,
      "40: concurrent billing write restored the expiry",
    );
    assert.equal(
      afterPatch.guestPaymentExchangeState,
      "redeemed",
      "40: concurrent billing write reset the state to redeemable",
    );
    // The spent code is still spent.
    const replay = await exchange(NUM_B, codeF);
    assert.equal(replay.status, 404, "40: code was redeemable a second time");
    assert.equal(replay.cookie, null, "40: replay issued a cookie");
    // The minted capability still pays.
    assert.notEqual(
      (
        await fetch(`${BASE}/api/payments/pay-inline`, {
          method: "POST",
          headers: { "content-type": "application/json", cookie: redeemedF.cookie! },
          body: JSON.stringify({ orderNumber: NUM_B }),
        })
      ).status,
      404,
      "40: minted capability stopped paying after a billing write",
    );
    console.log("PASS 40 redemption survives a concurrent billing write");

    // 41: interleaved writes, both orders. Race redemption against a billing
    // patch repeatedly; the redeemed state must be stable every time.
    for (let i = 0; i < 5; i++) {
      const code = crypto.randomBytes(32).toString("base64url");
      await armExchange(NUM_B, code);
      // Interleave: patch first, redeem second, then patch again.
      await patchBilling(NUM_B, { razorpayOrderId: `order_rzp_${i}` });
      const r = await exchange(NUM_B, code);
      assert.equal(r.status, 200, `41: iteration ${i} rejected a live code`);
      await patchBilling(NUM_B, { razorpayOrderAmount: 100_000 + i });
      const b = await billingOf(NUM_B);
      assert.equal(
        b.guestPaymentExchangeState,
        "redeemed",
        `41: iteration ${i} lost the redeemed state`,
      );
      assert.equal(
        b.guestPaymentExchangeTokenHash,
        hash(r.cookie!.split("=")[1]),
        `41: iteration ${i} lost the minted capability`,
      );
      assert.equal(
        b.razorpayOrderId,
        `order_rzp_${i}`,
        `41: iteration ${i} lost an unrelated Razorpay field`,
      );
      assert.equal((await exchange(NUM_B, code)).status, 404);
    }
    console.log("PASS 41 interleaved billing writes never resurrect a code");

    // 42: simultaneous redemption of the SAME code yields exactly one cookie.
    const codeRace = crypto.randomBytes(32).toString("base64url");
    await armExchange(NUM_B, codeRace);
    const racers = await Promise.all(
      Array.from({ length: 6 }, () => exchange(NUM_B, codeRace)),
    );
    const winners = racers.filter((r) => r.status === 200);
    assert.equal(
      winners.length,
      1,
      `42: ${winners.length} simultaneous redemptions succeeded`,
    );
    for (const loser of racers.filter((r) => r.status !== 200)) {
      assert.equal(loser.cookie, null, "42: a losing racer still got a cookie");
      assert.equal(loser.status, 404, "42: loser status differed from 404");
    }
    console.log("PASS 42 six simultaneous redemptions yield exactly one cookie");

    // 43: an order with NO exchange state at all cannot be redeemed, even by a
    // caller presenting the checkout browser's own capability as the code.
    const bare = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: NUM_B },
      select: { billingDetails: true },
    });
    const bareHash = (bare.billingDetails as Record<string, unknown>)
      .guestPaymentTokenHash as string;
    // plant the checkout hash in the exchange slot with no state key
    await prisma.order.update({
      where: { orderNumber: NUM_B },
      data: {
        billingDetails: {
          guestPaymentExchangeTokenHash: bareHash,
          guestPaymentExchangeExpiresAt: Date.now() + 60_000,
        } as never,
      },
    });
    const noState = await exchange(NUM_B, capB);
    assert.equal(noState.status, 404, "43: state-less exchange slot was accepted");
    assert.equal(noState.cookie, null, "43: state-less slot issued a cookie");
    const noStatePay = await fetch(`${BASE}/api/payments/pay-inline`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: payCookie(capB) },
      body: JSON.stringify({ orderNumber: NUM_B }),
    });
    assert.equal(
      noStatePay.status,
      404,
      "43: a state-less exchange slot authorized payment",
    );
    console.log("PASS 43 missing exchange state authorizes nothing");

    // 44: GTM must not be handed the code. The interstitial strips ?code= from
    // the address bar at hydration; GTM is lazyOnload and reads location.href.
    const gtmPage = await fetch(
      `${BASE}/order/success/${NUM_B}/exchange?code=${"H".repeat(43)}`,
    );
    const gtmBody = await gtmPage.text();
    assert.ok(
      /googletagmanager\.com\/gtm\.js/.test(gtmBody),
      "44: GTM script missing (sanity)",
    );
    assert.ok(
      /replaceState/.test(gtmBody),
      "44: interstitial does not strip the code from the URL",
    );
    // The stripping must be scoped to the code param, not a blanket redirect.
    assert.ok(
      /searchParams\.delete\(\s*["']code["']\s*\)/.test(gtmBody),
      "44: stripping is not scoped to the code param",
    );
    console.log("PASS 44 interstitial strips ?code= before GTM can read it");
  }

  // ── 45–48  checkout replay is scoped to the original checkout context ──
  //
  // The replay lookup finds an order by checkoutId alone, so learning somebody
  // else's checkoutId used to hand over their PII and mint a fresh payment
  // capability for their order.
  //
  // This works without the Razorpay gateway: a scoped replay returns early with
  // the stored razorpayOrderId, so the legitimate case answers 200 with no
  // gateway call at all, while an unscoped caller falls through to order
  // creation and fails on the unreachable gateway (500). The two cases are
  // therefore distinguishable by status alone, which is what makes the negative
  // assertions below meaningful.
  {
    const slug = "SECREPLAY_CAT";
    const cartToken = "SECREPLAY_CART";
    const replayCheckoutId = crypto.randomUUID();
    const victimCap = crypto.randomBytes(32).toString("base64url");

    async function seedCartForReplay() {
      await prisma.cart.deleteMany({ where: { guestToken: cartToken } });
      await prisma.category.deleteMany({ where: { slug } });
      await prisma.product.deleteMany({ where: { slug: `${slug}_PROD` } });
      const category = await prisma.category.create({
        data: { name: "Replay Cat", slug },
      });
      const product = await prisma.product.create({
        data: {
          name: "Replay Product",
          slug: `${slug}_PROD`,
          type: "KEYBOARD",
          categoryId: category.id,
          price: 250_000,
          stock: 10,
          active: true,
          gstRate: 18,
          weight: 1200,
          freeShipping: true,
        },
      });
      await prisma.cart.create({
        data: {
          guestToken: cartToken,
          items: { create: { productId: product.id, quantity: 1 } },
        },
      });
    }

    async function postCreateOrder(checkoutId: string, cookie: string) {
      const r = await fetch(`${BASE}/api/payments/create-order`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({
          email: "replay@secrettest.invalid",
          checkoutId,
          shippingAddress: {
            firstName: "Replay",
            lastName: "Guest",
            streetAddress: "REPLAY_STREET",
            city: "REPLAY_CITY",
            state: "Goa",
            postalCode: "403001",
            phone: "+919111100009",
          },
        }),
      });
      const body = await r.text();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(body) as Record<string, unknown>;
      } catch {
        /* gateway error body */
      }
      return {
        status: r.status,
        body,
        data,
        setCookie:
          r.headers.getSetCookie?.().find((c) => c.startsWith("kf_pay=")) ??
          null,
      };
    }

    await seedCartForReplay();

    // Exactly what a successful create-order persists: a checkoutId plus the
    // hash of the capability that browser received.
    await prisma.order.create({
      data: {
        orderNumber: "SECREPLAY1",
        type: "PRODUCT",
        status: "ORDER_RECEIVED",
        paymentStatus: "PENDING",
        customerName: "VICTIM_NAME",
        customerEmail: "victim@secrettest.invalid",
        customerPhone: "+919111100010",
        subtotal: 100_000,
        total: 100_000,
        currency: "INR",
        billingDetails: {
          checkoutId: replayCheckoutId,
          guestPaymentTokenHash: hash(victimCap),
          razorpayOrderId: "order_rzp_victim",
          razorpayOrderAmount: 100_000,
        } as never,
      },
    });

    // 45: the original checkout browser — the one holding the payment cookie —
    // can still replay, and gets a rotated capability.
    const legit = await postCreateOrder(
      replayCheckoutId,
      `kf_cart=${cartToken}; kf_pay=${victimCap}`,
    );
    assert.equal(legit.status, 200, `45: legitimate replay failed (${legit.body})`);
    assert.equal(
      legit.data.orderNumber,
      "SECREPLAY1",
      "45: replayed the wrong order",
    );
    assert.ok(legit.setCookie, "45: replay issued no payment cookie");
    const rotated = legit.setCookie!.split(";")[0];
    assert.notEqual(rotated, payCookie(victimCap), "45: capability not rotated");
    const afterReplay = await billingOf("SECREPLAY1");
    assert.equal(
      afterReplay.guestPaymentTokenHash,
      hash(rotated.split("=")[1]),
      "45: stored hash does not match the rotated cookie",
    );
    assert.equal(
      afterReplay.razorpayOrderId,
      "order_rzp_victim",
      "45: replay lost the Razorpay order",
    );
    console.log("PASS 45 the original checkout browser can still replay");

    // 46: an unrelated session — no payment cookie — must not replay it. It gets
    // neither the victim's PII nor a capability, and no new order for the id.
    const attacker = await postCreateOrder(
      replayCheckoutId,
      `kf_cart=${cartToken}`,
    );
    assert.notEqual(
      attacker.data.orderNumber,
      "SECREPLAY1",
      "46: cross-session replay returned the victim's order",
    );
    for (const marker of [
      "victim@secrettest.invalid",
      "VICTIM_NAME",
      "SECREPLAY1",
      "+919111100010",
    ]) {
      assert.equal(
        has(attacker.body, marker),
        false,
        `46: cross-session replay exposed ${marker}`,
      );
    }
    const afterAttack = await billingOf("SECREPLAY1");
    assert.equal(
      afterAttack.guestPaymentTokenHash,
      afterReplay.guestPaymentTokenHash,
      "46: cross-session replay rotated the victim's capability",
    );
    assert.equal(
      await prisma.order.count({
        where: {
          billingDetails: { path: ["checkoutId"], equals: replayCheckoutId },
        },
      }),
      1,
      "46: replay minted a duplicate order",
    );
    console.log("PASS 46 cross-session checkout replay is rejected");

    // 47: a signed-in non-owner session must not replay a guest order either.
    const otherJar = await signUp(OTHER_EMAIL);
    const asOther = await postCreateOrder(
      replayCheckoutId,
      `kf_cart=${cartToken}; ${otherJar}`,
    );
    assert.notEqual(
      asOther.data.orderNumber,
      "SECREPLAY1",
      "47: a signed-in non-owner replayed a guest order",
    );
    for (const marker of ["victim@secrettest.invalid", "VICTIM_NAME"]) {
      assert.equal(
        has(asOther.body, marker),
        false,
        `47: non-owner replay exposed ${marker}`,
      );
    }
    assert.equal(
      (await billingOf("SECREPLAY1")).guestPaymentTokenHash,
      afterReplay.guestPaymentTokenHash,
      "47: non-owner replay rotated the victim's capability",
    );
    console.log("PASS 47 signed-in non-owner cannot replay a guest order");

    // 48: the victim is unaffected throughout — their cookie still pays.
    const victimPay = await fetch(`${BASE}/api/payments/pay-inline`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: payCookie(victimCap) },
      body: JSON.stringify({ orderNumber: "SECREPLAY1" }),
    });
    assert.notEqual(
      victimPay.status,
      404,
      "48: the victim's original capability stopped working",
    );
    console.log("PASS 48 replay attempts leave the victim's own access intact");

    await prisma.order.deleteMany({ where: { orderNumber: "SECREPLAY1" } });
    await prisma.cart.deleteMany({ where: { guestToken: cartToken } });
    await prisma.category.deleteMany({ where: { slug } });
    await prisma.product.deleteMany({ where: { slug: `${slug}_PROD` } });
  }

  // ── 27b  live create-order leg (skipped when the gateway is unreachable) ─
  {
    const slug = "SECPAGE_CAT";
    await prisma.category.deleteMany({ where: { slug } });
    await prisma.product.deleteMany({ where: { slug: `${slug}_PROD` } });
    const category = await prisma.category.create({
      data: { name: "SecPage Cat", slug },
    });
    const product = await prisma.product.create({
      data: {
        name: "SecPage Product",
        slug: `${slug}_PROD`,
        type: "KEYBOARD",
        categoryId: category.id,
        price: 250_000,
        stock: 10,
        active: true,
        gstRate: 18,
        weight: 1200,
        freeShipping: true,
      },
    });
    const cartToken = "SECPAGE_CART";
    await prisma.cart.deleteMany({ where: { guestToken: cartToken } });
    await prisma.cart.create({
      data: {
        guestToken: cartToken,
        items: { create: { productId: product.id, quantity: 1 } },
      },
    });

    const created = await fetch(`${BASE}/api/payments/create-order`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `kf_cart=${cartToken}`,
      },
      body: JSON.stringify({
        email: M.bEmail,
        shippingAddress: {
          firstName: "Checkout",
          lastName: "Guest",
          streetAddress: "SECRET_CHECKOUT_STREET",
          city: "SECRET_CHECKOUT_CITY",
          state: "Goa",
          postalCode: "403001",
          phone: "+919111100004",
        },
      }),
    });
    const createdBody = await created.text();
    if (created.status !== 200) {
      // `razorpay` is bundled into the server chunk, so an external Module._load
      // hook cannot intercept it and the placeholder keys in
      // .env.e2e.local make the gateway return 401. The cookie/exchange round-trip is
      // covered by 27-31 above and by pay-inline test 23.
      console.log(
        `SKIP 27b live create-order (HTTP ${created.status}: ${createdBody.slice(0, 80)}) — gateway not stubbable in a bundled build`,
      );
    } else {
      const data = JSON.parse(createdBody) as {
        orderNumber: string;
        guestPaymentToken?: string;
      };
      // No credential in the body any more — it arrives as a cookie.
      assert.equal(
        data.guestPaymentToken,
        undefined,
        "27b: create-order still returns a capability in the response body",
      );
      const setCookie =
        created.headers
          .getSetCookie?.()
          .find((c) => c.startsWith("kf_pay=")) ?? "";
      assert.ok(setCookie, "27b: create-order set no payment cookie");
      // Post-checkout redirect: clean URL, cookie authorizes.
      const landed = await hit(
        `/order/success/${data.orderNumber}`,
        setCookie.split(";")[0],
      );
      assert.equal(landed.status, 200);
      assert.ok(
        has(landed.body, "SECRET_CHECKOUT_STREET"),
        "27b: post-checkout page is not usable",
      );
      assert.ok(
        has(landed.body, "os-pay-now"),
        "27b: post-checkout page lost the Pay button",
      );
      console.log("PASS 27b live guest checkout sets a cookie; redirect is clean");
      await prisma.order.deleteMany({
        where: { orderNumber: data.orderNumber },
      });
    }

    await prisma.cart.deleteMany({ where: { guestToken: cartToken } });
    await prisma.product.deleteMany({ where: { slug: `${slug}_PROD` } });
    await prisma.category.deleteMany({ where: { slug } });
  }

  await cleanup();
  console.log("\nALL ORDER SUCCESS PAGE SECURITY TESTS PASSED");
  process.exit(0);
})().catch(async (e) => {
  console.error("FAIL", e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
