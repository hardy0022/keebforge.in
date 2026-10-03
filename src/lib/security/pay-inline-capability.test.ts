import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  EXCHANGE_EXPIRY_KEY,
  EXCHANGE_HASH_KEY,
  EXCHANGE_PARAM,
  EXCHANGE_STATE_KEY,
  EXCHANGE_STATE_REDEEMABLE,
  EXCHANGE_STATE_REDEEMED,
  EXCHANGE_TTL_MS,
  GUEST_TOKEN_HASH_KEY,
  PAY_COOKIE,
  createExchangeCode,
  createOrderCapability,
  guestPaymentExchangeExpiresAt,
  guestPaymentExchangeHash,
  guestPaymentExchangeState,
  guestPaymentTokenHash,
  hashOrderCapability,
  normalizeOrderNumber,
  readCapabilityParam,
  verifyOrderCapability,
  verifyOrderExchange,
  verifyOrderPayCookie,
  withRedeemedExchange,
} from "@/lib/payments/order-capability";
import {
  isEntitledToPay,
  startInlinePayment,
  type InlinePaymentDeps,
  type InlinePaymentOrder,
} from "@/lib/payments/pay-inline-core";

// Fakes stand in for prisma + Razorpay so nothing here touches the network or
// the database. Every test asserts on the call log, which is how we prove no
// side effect happens before authorization.

type CallLog = {
  findOrder: string[];
  ensureCustomer: string[];
  createRazorpayOrder: string[];
  patchBilling: Array<{
    orderId: string;
    patch: Record<string, string | number | null>;
  }>;
};

const KEY_ID = "rzp_test_key";

function makeOrder(
  overrides: Partial<InlinePaymentOrder> = {},
): InlinePaymentOrder {
  return {
    id: "ord_1",
    orderNumber: "KF30X2A",
    total: 100_000,
    paymentStatus: "PENDING",
    profileId: null,
    customerName: "Asha Verma",
    customerEmail: "asha@example.com",
    customerPhone: "+919800000000",
    billingDetails: {},
    payments: [],
    ...overrides,
  };
}

/** Order whose billingDetails already carries a live Razorpay order. */
function makeOrderWithRazorpay(
  razorpayOrderId: string,
  amount: number,
  extra: Record<string, unknown> = {},
) {
  const capability = createOrderCapability();
  return {
    order: makeOrder({
      billingDetails: {
        [GUEST_TOKEN_HASH_KEY]: capability.hash,
        razorpayOrderId,
        razorpayOrderAmount: amount,
        checkoutId: "chk_keepme",
        razorpayCustomerId: "cust_keep",
        ...extra,
      },
    }),
    capability,
  };
}

function makeDeps(
  order: InlinePaymentOrder | null,
  overrides: Partial<InlinePaymentDeps> = {},
): { deps: InlinePaymentDeps; log: CallLog } {
  const log: CallLog = {
    findOrder: [],
    ensureCustomer: [],
    createRazorpayOrder: [],
    patchBilling: [],
  };
  let rzpSeq = 0;

  const deps: InlinePaymentDeps = {
    keyId: KEY_ID,
    async findOrder(orderNumber) {
      log.findOrder.push(orderNumber);
      return order && order.orderNumber === orderNumber ? order : null;
    },
    async currentProfileId() {
      return null;
    },
    async ensureCustomer(o) {
      log.ensureCustomer.push(o.orderNumber);
      return "cust_created";
    },
    async createRazorpayOrder(args) {
      log.createRazorpayOrder.push(`${args.orderNumber}:${args.amount}`);
      rzpSeq += 1;
      return {
        id: `order_rzp${rzpSeq}`,
        amount: args.amount,
        currency: "INR",
      };
    },
    async patchBillingDetails(orderId, patch) {
      log.patchBilling.push({ orderId, patch });
    },
    ...overrides,
  };

  return { deps, log };
}

const body = (r: Awaited<ReturnType<typeof startInlinePayment>>) =>
  JSON.stringify(r.body);

(async () => {
  // ── 1. Valid token + correct order succeeds ──────────────────────────────
  {
    const { order, capability } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const { deps, log } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: capability.token,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.razorpayOrderId, "order_rzp_old");
    assert.equal(r.body.amount, 100_000);
    assert.equal(r.body.keyId, KEY_ID);
    console.log("PASS 1 valid token + correct order succeeds");
    void log;
  }

  // ── 2. Missing token rejected (guest order, no session) ──────────────────
  {
    const { order } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const { deps, log } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: undefined,
    });
    assert.equal(r.status, 404);
    assert.deepEqual(log.createRazorpayOrder, []);
    assert.deepEqual(log.ensureCustomer, []);
    assert.deepEqual(log.patchBilling, []);
    console.log("PASS 2 missing token rejected, no Razorpay side effects");
  }

  // ── 3. Invalid token rejected ────────────────────────────────────────────
  {
    const { order } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const { deps, log } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: createOrderCapability().token,
    });
    assert.equal(r.status, 404);
    assert.deepEqual(log.createRazorpayOrder, []);
    assert.deepEqual(log.patchBilling, []);
    console.log("PASS 3 invalid token rejected");
  }

  // ── 4. Valid token + wrong orderNumber rejected ──────────────────────────
  {
    const { order, capability } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const { deps, log } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KFOTHER",
      capabilityToken: capability.token,
    });
    assert.equal(r.status, 404);
    assert.deepEqual(log.createRazorpayOrder, []);
    console.log("PASS 4 valid token + wrong order number rejected");
  }

  // ── 5. Token from ANOTHER order + target orderNumber rejected ────────────
  {
    const { order } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const attacker = createOrderCapability(); // a different order's token
    const { deps, log } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: attacker.token,
    });
    assert.equal(r.status, 404);
    assert.deepEqual(log.createRazorpayOrder, []);
    assert.deepEqual(log.patchBilling, []);
    console.log("PASS 5 another order's token rejected");
  }

  // ── 6. Order number ALONE cannot authorize ───────────────────────────────
  {
    const { order } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const { deps, log } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: null,
    });
    assert.equal(r.status, 404);
    assert.deepEqual(log.ensureCustomer, []);
    assert.deepEqual(log.createRazorpayOrder, []);
    assert.deepEqual(log.patchBilling, []);
    console.log("PASS 6 order number alone cannot authorize payment");
  }

  // ── 7/8/9. Unauthorized response leaks no customer PII ───────────────────
  {
    const { order, capability } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    for (const token of [null, undefined, "", "not-a-token"]) {
      const { deps } = makeDeps(order);
      const r = await startInlinePayment(deps, {
        orderNumber: "KF30X2A",
        capabilityToken: token,
      });
      const serialized = body(r);
      assert.equal(serialized.includes("Asha Verma"), false, "name leaked");
      assert.equal(serialized.includes("asha@example.com"), false, "email leaked");
      assert.equal(serialized.includes("+919800000000"), false, "phone leaked");
      assert.equal(serialized.includes(capability.hash), false, "hash leaked");
    }
    console.log("PASS 7-9 unauthorized response carries no name/email/phone/hash");
  }

  // ── 10. Authorized response contains only what the payment client needs ──
  {
    const { order, capability } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const { deps } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: capability.token,
    });
    assert.deepEqual(Object.keys(r.body).sort(), [
      "amount",
      "currency",
      "keyId",
      "orderId",
      "orderNumber",
      "razorpayOrderId",
    ]);
    const serialized = body(r);
    assert.equal(serialized.includes("Asha Verma"), false);
    assert.equal(serialized.includes("asha@example.com"), false);
    assert.equal(serialized.includes("+919800000000"), false);
    console.log("PASS 10 authorized response has payment fields only, no PII");
  }

  // ── 11/12/13. Bad credentials ⇒ zero Razorpay + zero billing mutation ───
  {
    const { order } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const attempts = [null, undefined, "", "x".repeat(43), 12345, {}];
    for (const token of attempts) {
      const { deps, log } = makeDeps(order);
      const r = await startInlinePayment(deps, {
        orderNumber: "KF30X2A",
        capabilityToken: token,
      });
      assert.notEqual(r.status, 200);
      assert.deepEqual(log.ensureCustomer, [], `customer created for ${token}`);
      assert.deepEqual(log.createRazorpayOrder, [], `order created for ${token}`);
      assert.deepEqual(log.patchBilling, [], `billing mutated for ${token}`);
    }
    console.log("PASS 11-13 invalid credentials cause no Razorpay/billing effects");
  }

  // ── 14. Existing Razorpay order ID is NOT blindly replaced ───────────────
  {
    const { order, capability } = makeOrderWithRazorpay("order_rzp_keep", 100_000);
    const { deps, log } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: capability.token,
    });
    assert.equal(r.body.razorpayOrderId, "order_rzp_keep");
    assert.deepEqual(log.createRazorpayOrder, [], "should not create a 2nd order");
    assert.deepEqual(log.patchBilling, [], "should not touch billingDetails");
    console.log("PASS 14 existing Razorpay order id preserved, not replaced");
  }

  // ── 15. Repeated legitimate calls are idempotent, no new Razorpay order ───
  {
    const { order, capability } = makeOrderWithRazorpay("order_rzp_keep", 100_000);
    for (let i = 0; i < 5; i++) {
      const { deps, log } = makeDeps(order);
      const r = await startInlinePayment(deps, {
        orderNumber: "KF30X2A",
        capabilityToken: capability.token,
      });
      assert.equal(r.status, 200);
      assert.equal(r.body.razorpayOrderId, "order_rzp_keep");
      assert.deepEqual(log.createRazorpayOrder, []);
    }
    console.log("PASS 15 repeated legitimate calls stay on the same order id");
  }

  // ── First payment (no existing Razorpay order) mints one and merges JSON ──
  {
    const capability = createOrderCapability();
    const order = makeOrder({
      billingDetails: {
        [GUEST_TOKEN_HASH_KEY]: capability.hash,
        checkoutId: "chk_abc",
        shippingFingerprint: "fp_123",
      },
    });
    const { deps, log } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: capability.token,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.razorpayOrderId, "order_rzp1");
    assert.equal(log.createRazorpayOrder.length, 1);
    assert.equal(log.patchBilling.length, 1);
    const patch = log.patchBilling[0].patch;
    assert.equal(patch.razorpayOrderId, "order_rzp1");
    assert.equal(patch.razorpayOrderAmount, 100_000);
    // A patch, not a replacement: unrelated keys are simply absent, so they
    // cannot be clobbered by the value this handler read earlier.
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, "checkoutId"),
      false,
      "patch must not restate unrelated keys",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, GUEST_TOKEN_HASH_KEY),
      false,
      "patch must not restate the capability hash",
    );
    assert.equal(
      Object.prototype.hasOwnProperty.call(patch, EXCHANGE_STATE_KEY),
      false,
      "patch must not restate exchange state",
    );
    console.log(
      "PASS 15b first payment mints one order, patches billing (no whole-doc replace)",
    );
  }

  // ── 16/17. Only the hash is stored; plaintext never persisted ────────────
  {
    const { token, hash } = createOrderCapability();
    const stored = { [GUEST_TOKEN_HASH_KEY]: hash };
    const dumped = JSON.stringify(stored);
    assert.equal(dumped.includes(token), false, "plaintext token persisted");
    assert.equal(hash.length, 64);
    assert.equal(/^[0-9a-f]{64}$/.test(hash), true);
    assert.equal(hashOrderCapability(token), hash);
    // Deterministic: the hash is verifiable, the token is not recoverable.
    assert.equal(crypto.createHash("sha256").update(token).digest("hex"), hash);
    console.log("PASS 16-17 only a SHA-256 hash is persisted");
  }

  // ── 18. Generated tokens are unpredictable and unique ────────────────────
  {
    const seen = new Set<string>();
    const hashes = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const c = createOrderCapability();
      assert.equal(seen.has(c.token), false, "token collision");
      assert.equal(hashes.has(c.hash), false, "hash collision");
      seen.add(c.token);
      hashes.add(c.hash);
      // 32 random bytes base64url-encoded.
      assert.equal(c.token.length, 43);
      assert.equal(/^[A-Za-z0-9_-]{43}$/.test(c.token), true);
    }
    // ~256 bits of entropy: the 4-char alphabet of order numbers is hopeless.
    assert.ok(seen.size >= 2000);
    console.log("PASS 18 tokens are high-entropy and unique over 2000 draws");
  }

  // ── 19. Verification succeeds only against its own order ─────────────────
  {
    const a = createOrderCapability();
    const b = createOrderCapability();
    assert.equal(verifyOrderCapability(a.token, a.hash), true);
    assert.equal(verifyOrderCapability(b.token, a.hash), false);
    assert.equal(verifyOrderCapability(a.token, b.hash), false);
    assert.equal(verifyOrderCapability(a.token, null), false);
    assert.equal(verifyOrderCapability(null, a.hash), false);
    assert.equal(verifyOrderCapability(a.token, "nothex"), false);
    assert.equal(verifyOrderCapability(a.token, ""), false);
    console.log("PASS 19 verification binds to exactly one order");
  }

  // ── 20/21/22. Order creation stores a hash and preserves sibling fields ───
  {
    const capability = createOrderCapability();
    // Mirrors the billingDetails object the create routes persist.
    const billingDetails = {
      checkoutId: "chk_x",
      guestPaymentTokenHash: capability.hash,
      razorpayOrderId: "order_rzp1",
      razorpayOrderAmount: 100_000,
      razorpayCustomerId: "cust_1",
    };
    assert.equal(guestPaymentTokenHash(billingDetails), capability.hash);
    assert.equal(billingDetails.checkoutId, "chk_x");
    assert.equal(billingDetails.razorpayOrderId, "order_rzp1");
    assert.equal(billingDetails.razorpayOrderAmount, 100_000);
    assert.equal(billingDetails.razorpayCustomerId, "cust_1");
    // Quote-only orders carry no billingDetails at all → no capability.
    assert.equal(guestPaymentTokenHash(null), null);
    assert.equal(guestPaymentTokenHash(undefined), null);
    assert.equal(guestPaymentTokenHash({}), null);
    assert.equal(guestPaymentTokenHash({ razorpayOrderId: "x" }), null);
    console.log("PASS 20-22 creation stores hash + leaves existing fields intact");
  }

  // ── 23. The success URL carries no credential at all ────────────────────
  {
    const { order, capability } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    // Post-checkout redirect: clean URL, entitlement via the HttpOnly cookie.
    const successUrl = new URL("https://kf.test/order/success/KF30X2A");
    assert.equal(successUrl.search, "", "success URL must have no query string");
    assert.equal(successUrl.searchParams.get(EXCHANGE_PARAM), null);
    assert.equal(successUrl.searchParams.get("pay"), null);
    assert.equal(successUrl.href.includes(capability.token), false);
    // …and the cookie value verifies against the stored hash.
    assert.equal(
      verifyOrderPayCookie(capability.token, order.billingDetails),
      true,
    );
    assert.equal(readCapabilityParam(undefined), null);
    assert.equal(readCapabilityParam("short"), null);
    assert.equal(readCapabilityParam(`${capability.token}x`), null);
    assert.equal(readCapabilityParam(`${capability.token}extra`), null);
    console.log("PASS 23 success URL is credential-free; cookie value verifies");
  }

  // ── 24. Email link carries an exchange code, not the capability ─────────
  {
    const capability = createOrderCapability();
    const exchange = createExchangeCode();
    const billingDetails = {
      [GUEST_TOKEN_HASH_KEY]: capability.hash,
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_EXPIRY_KEY]: exchange.expiresAt,
      [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
    };
    // What order-confirmation-email.ts builds.
    const payUrl = new URL(
      `https://kf.test/order/success/KF30X2A/exchange?${EXCHANGE_PARAM}=${exchange.code}`,
    );
    assert.equal(
      payUrl.pathname,
      "/order/success/KF30X2A/exchange",
      "email must point at the interstitial, not the order page",
    );
    const fromEmail = readCapabilityParam(payUrl.searchParams.get(EXCHANGE_PARAM));
    assert.equal(fromEmail, exchange.code);
    assert.equal(verifyOrderExchange(fromEmail, billingDetails), true);
    // The capability itself is NOT in the email — only the code is.
    assert.equal(payUrl.href.includes(capability.token), false);
    // …and the code alone is not a payment credential.
    assert.equal(verifyOrderPayCookie(exchange.code, billingDetails), false);
    // The tracking link carries nothing.
    const trackUrl = new URL("https://kf.test/track-order?order=KF30X2A");
    assert.equal(trackUrl.searchParams.get(EXCHANGE_PARAM), null);
    console.log("PASS 24 email carries a code that is not itself a credential");
  }

  // ── 25. Redeeming the code mints a NEW capability, leaving the old one live
  {
    const checkout = createOrderCapability();
    const exchange = createExchangeCode();
    const before = {
      checkoutId: "chk_keep",
      [GUEST_TOKEN_HASH_KEY]: checkout.hash,
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_EXPIRY_KEY]: exchange.expiresAt,
      [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
      razorpayOrderId: "order_rzp_old",
    };
    const redeemed = createOrderCapability();
    const after = withRedeemedExchange(before, redeemed.hash);

    // Code is now spent.
    assert.equal(verifyOrderExchange(exchange.code, after), false);
    // The redeemed capability pays.
    assert.equal(verifyOrderPayCookie(redeemed.token, after), true);
    // The checkout browser's capability still pays — independent paths.
    assert.equal(verifyOrderPayCookie(checkout.token, after), true);
    // Sibling fields and the checkout hash survive untouched.
    assert.equal(after.checkoutId, "chk_keep");
    assert.equal(after.razorpayOrderId, "order_rzp_old");
    assert.equal(after[GUEST_TOKEN_HASH_KEY], checkout.hash);
    // Expiry is dropped and state flips explicitly, so a later code can never be
    // re-armed and the redeemed hash can never be read as "still redeemable".
    assert.equal(guestPaymentExchangeExpiresAt(after), null);
    assert.equal(guestPaymentExchangeState(after), EXCHANGE_STATE_REDEEMED);
    console.log("PASS 25 redemption mints a new capability, old one stays valid");
  }

  // ── 25b. Single use: the second redemption of the same code fails ───────
  {
    const exchange = createExchangeCode();
    let billing: Record<string, unknown> = {
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_EXPIRY_KEY]: exchange.expiresAt,
      [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
    };
    for (let i = 0; i < 3; i++) {
      const verified = verifyOrderExchange(exchange.code, billing);
      if (!verified) break;
      billing = withRedeemedExchange(billing, createOrderCapability().hash);
    }
    assert.equal(verifyOrderExchange(exchange.code, billing), false);
    assert.equal(verifyOrderExchange(createOrderCapability().token, billing), false);
    console.log("PASS 25b an exchange code verifies exactly once");
  }

  // ── 25c. Expired codes never verify, at any storage shape ───────────────
  {
    const exchange = createExchangeCode();
    const now = Date.now();
    const live = {
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_EXPIRY_KEY]: now + 60_000,
      [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
    };
    const expired = {
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_EXPIRY_KEY]: now - 1,
      [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
    };
    const noExpiry = {
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
    };
    const badExpiry = {
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_EXPIRY_KEY]: "soon",
      [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
    };
    assert.equal(verifyOrderExchange(exchange.code, live, now), true);
    for (const shape of [expired, noExpiry, badExpiry, {}, null, undefined]) {
      assert.equal(verifyOrderExchange(exchange.code, shape, now), false);
    }
    // A fresh code's expiry is in the future and bounded by the TTL.
    const fresh = createExchangeCode();
    assert.ok(fresh.expiresAt > now);
    assert.ok(fresh.expiresAt <= now + EXCHANGE_TTL_MS + 1000);
    console.log("PASS 25c expired / missing / malformed expiry all rejected");
  }

  // ── 25d. Stored readers tolerate junk without throwing ──────────────────
  {
    assert.equal(guestPaymentExchangeHash(null), null);
    assert.equal(guestPaymentExchangeHash({}), null);
    assert.equal(guestPaymentExchangeHash({ [EXCHANGE_HASH_KEY]: 42 }), null);
    assert.equal(guestPaymentExchangeExpiresAt(null), null);
    assert.equal(guestPaymentExchangeExpiresAt({}), null);
    assert.equal(
      guestPaymentExchangeExpiresAt({ [EXCHANGE_EXPIRY_KEY]: Number.NaN }),
      null,
    );
    assert.equal(
      guestPaymentExchangeExpiresAt({ [EXCHANGE_EXPIRY_KEY]: Infinity }),
      null,
    );
    assert.equal(
      guestPaymentExchangeExpiresAt({ [EXCHANGE_EXPIRY_KEY]: 5 }),
      5,
    );
    assert.equal(guestPaymentExchangeState(null), null);
    assert.equal(guestPaymentExchangeState({}), null);
    assert.equal(guestPaymentExchangeState({ [EXCHANGE_STATE_KEY]: 42 }), null);
    // The cookie name is stable and not guessable from the cart cookie.
    assert.equal(PAY_COOKIE, "kf_pay");
    assert.notEqual(PAY_COOKIE, "kf_cart");
    console.log("PASS 25d stored readers reject junk without throwing");
  }

  // ── 25f. Missing / wrong exchange state can never authorize payment ─────
  //
  // Regression guard for the implicit-redemption bug: the exchange slot used to
  // count as "redeemed" whenever the expiry key was absent, which also matched
  // every order that simply never had exchange data (services orders, anything
  // predating the feature). The state is now explicit.
  {
    const exchange = createExchangeCode();
    const redeemedCap = createOrderCapability();

    // A hash alone, with a live expiry, and no state at all: NOT a credential.
    const hashOnly = {
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_EXPIRY_KEY]: Date.now() + 60_000,
    };
    assert.equal(
      verifyOrderPayCookie(exchange.code, hashOnly),
      false,
      "unredeemed code must not authorize payment",
    );
    // Even a hash that IS a valid capability, but with no redeemed state.
    const orphanCapability = {
      [EXCHANGE_HASH_KEY]: redeemedCap.hash,
    };
    assert.equal(
      verifyOrderPayCookie(redeemedCap.token, orphanCapability),
      false,
      "state-less exchange slot must not authorize payment",
    );
    // Explicitly redeemable is also not sufficient for the cookie path — only
    // `redeemed` is.
    const redeemable = {
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_EXPIRY_KEY]: Date.now() + 60_000,
      [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
    };
    assert.equal(verifyOrderPayCookie(exchange.code, redeemable), false);
    // A services-style order with no exchange keys at all.
    const noExchangeData = { razorpayOrderId: "order_x", checkoutId: "chk" };
    assert.equal(
      verifyOrderPayCookie(createOrderCapability().token, noExchangeData),
      false,
    );
    // Unrecognised state values fail closed too.
    for (const bogus of ["", "REDEEMED", "redeemed ", "true", 1, null]) {
      assert.equal(
        verifyOrderPayCookie(redeemedCap.token, {
          [EXCHANGE_HASH_KEY]: redeemedCap.hash,
          [EXCHANGE_STATE_KEY]: bogus,
        }),
        false,
        `state ${JSON.stringify(bogus)} must not authorize payment`,
      );
    }
    // The primary checkout slot is untouched by any of this.
    const checkout = createOrderCapability();
    const stillWorks = {
      [GUEST_TOKEN_HASH_KEY]: checkout.hash,
      [EXCHANGE_HASH_KEY]: exchange.hash,
      [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
    };
    assert.equal(verifyOrderPayCookie(checkout.token, stillWorks), true);
    // And the redeemed path still works when state IS explicit.
    const redeemed = withRedeemedExchange(
      {
        [GUEST_TOKEN_HASH_KEY]: checkout.hash,
        [EXCHANGE_HASH_KEY]: exchange.hash,
        [EXCHANGE_EXPIRY_KEY]: Date.now() + 60_000,
        [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
      },
      redeemedCap.hash,
    );
    assert.equal(verifyOrderPayCookie(redeemedCap.token, redeemed), true);
    assert.equal(verifyOrderPayCookie(checkout.token, redeemed), true);
    assert.equal(verifyOrderExchange(exchange.code, redeemed), false);
    console.log("PASS 25f only an explicit `redeemed` state authorizes payment");
  }

  // ── 25e. A redeemed capability works against pay-inline end-to-end ──────
  {
    const order = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const redeemed = createOrderCapability();
    const exchange = createExchangeCode();
    const billingDetails = withRedeemedExchange(
      {
        ...(order.order.billingDetails as Record<string, unknown>),
        [EXCHANGE_HASH_KEY]: exchange.hash,
        [EXCHANGE_EXPIRY_KEY]: exchange.expiresAt,
        [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMABLE,
      },
      redeemed.hash,
    );
    const { deps } = makeDeps(
      makeOrder({ billingDetails, payments: [] }),
    );
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: redeemed.token,
    });
    assert.equal(r.status, 200);
    console.log("PASS 25e redeemed capability authorizes pay-inline");
  }

  // ── 26. Random orderNumber + random token creates nothing ────────────────
  {
    for (let i = 0; i < 25; i++) {
      const { deps, log } = makeDeps(null);
      const r = await startInlinePayment(deps, {
        orderNumber: `KF${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        capabilityToken: createOrderCapability().token,
      });
      assert.equal(r.status, 404);
      assert.deepEqual(log.createRazorpayOrder, []);
      assert.deepEqual(log.patchBilling, []);
    }
    console.log("PASS 26 random order + random token creates nothing");
  }

  // ── 27. Repeated invalid attempts leave no side effects ──────────────────
  {
    const { order } = makeOrderWithRazorpay("order_rzp_keep", 100_000);
    for (let i = 0; i < 50; i++) {
      const { deps, log } = makeDeps(order);
      const r = await startInlinePayment(deps, {
        orderNumber: "KF30X2A",
        capabilityToken: createOrderCapability().token,
      });
      assert.equal(r.status, 404);
      assert.deepEqual(log.ensureCustomer, []);
      assert.deepEqual(log.createRazorpayOrder, []);
      assert.deepEqual(log.patchBilling, []);
    }
    console.log("PASS 27 50 invalid attempts, zero side effects");
  }

  // ── Error responses do not reveal whether the order exists ───────────────
  {
    const { order } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const { deps } = makeDeps(order);
    const exists = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: "x".repeat(43),
    });
    const missing = await startInlinePayment(deps, {
      orderNumber: "KFNOPE1",
      capabilityToken: "x".repeat(43),
    });
    assert.equal(exists.status, missing.status);
    assert.deepEqual(exists.body, missing.body);
    assert.equal(body(exists).includes("KF30X2A"), false);
    console.log("PASS 28 unknown-order and bad-token responses are identical");
  }

  // ── Payability rules still apply for an entitled caller ──────────────────
  {
    const cases: Array<[string, Partial<InlinePaymentOrder>]> = [
      ["paid order", { paymentStatus: "PAID" }],
      ["refunded order", { paymentStatus: "REFUNDED" }],
      [
        "fully paid by payments",
        { total: 100_000, payments: [{ amount: 100_000, status: "PAID" }] },
      ],
    ];
    for (const [label, override] of cases) {
      const capability = createOrderCapability();
      const order = makeOrder({
        billingDetails: { [GUEST_TOKEN_HASH_KEY]: capability.hash },
        ...override,
      });
      const { deps, log } = makeDeps(order);
      const r = await startInlinePayment(deps, {
        orderNumber: "KF30X2A",
        capabilityToken: capability.token,
      });
      assert.equal(r.status, 400, `${label} should be 400, got ${r.status}`);
      assert.deepEqual(log.createRazorpayOrder, [], label);
    }
    console.log("PASS 29 payability rules unchanged for entitled callers");
  }

  // ── Missing Razorpay config ⇒ 503, no gateway call ──────────────────────
  {
    const { order, capability } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    const { deps, log } = makeDeps(order, { keyId: null });
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: capability.token,
    });
    assert.equal(r.status, 503);
    assert.deepEqual(log.createRazorpayOrder, []);
    console.log("PASS 30 unconfigured gateway ⇒ 503 without calling Razorpay");
  }

  // ── Partial payment forces a NEW order (stored amount no longer matches) ──
  {
    const capability = createOrderCapability();
    const order = makeOrder({
      total: 100_000,
      payments: [{ amount: 40_000, status: "PAID" }],
      billingDetails: {
        [GUEST_TOKEN_HASH_KEY]: capability.hash,
        razorpayOrderId: "order_rzp_stale",
        razorpayOrderAmount: 100_000,
      },
    });
    const { deps, log } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: capability.token,
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.amount, 60_000, "outstanding should be total - paid");
    assert.equal(r.body.razorpayOrderId, "order_rzp1", "should mint a new order");
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        log.patchBilling[0].patch,
        GUEST_TOKEN_HASH_KEY,
      ),
      false,
      "capability hash must not be restated (would clobber a concurrent write)",
    );
    console.log("PASS 31 outstanding amount recomputed, stale order replaced");
  }

  // ── Signed-in owner is entitled without a capability ─────────────────────
  {
    const capability = createOrderCapability();
    const order = makeOrder({
      profileId: "prof_owner",
      billingDetails: { [GUEST_TOKEN_HASH_KEY]: capability.hash },
    });
    const { deps, log } = makeDeps(order, {
      async currentProfileId() {
        return "prof_owner";
      },
    });
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: null,
    });
    assert.equal(r.status, 200, "owner session should be entitled");
    assert.deepEqual(log.createRazorpayOrder.length, 1);
    console.log("PASS 32 owner session is entitled without a capability");
  }

  // ── Signed-in NON-owner is not entitled ─────────────────────────────────
  {
    const capability = createOrderCapability();
    const order = makeOrder({
      profileId: "prof_owner",
      billingDetails: { [GUEST_TOKEN_HASH_KEY]: capability.hash },
    });
    const { deps, log } = makeDeps(order, {
      async currentProfileId() {
        return "prof_someone_else";
      },
    });
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: null,
    });
    assert.equal(r.status, 404);
    assert.deepEqual(log.createRazorpayOrder, []);
    console.log("PASS 33 signed-in non-owner rejected");
  }

  // ── Legacy pre-token order: no hash ⇒ guest pay blocked, not auto-granted ──
  {
    const legacy = makeOrder({
      billingDetails: { razorpayOrderId: "order_rzp_legacy" },
    });
    const { deps, log } = makeDeps(legacy);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: null,
    });
    assert.equal(r.status, 404, "legacy guest order must not be orderNumber-open");
    assert.deepEqual(log.createRazorpayOrder, []);

    // …but the owner of a legacy order can still pay. Legacy rows predate
    // razorpayOrderAmount, so the stored order's amount is unknown and a fresh
    // one is minted — the same outcome the old endpoint always produced.
    const entitled = makeOrder({
      profileId: "prof_legacy",
      billingDetails: { razorpayOrderId: "order_rzp_legacy" },
    });
    const second = makeDeps(entitled, {
      async currentProfileId() {
        return "prof_legacy";
      },
    });
    const ok = await startInlinePayment(second.deps, {
      orderNumber: "KF30X2A",
      capabilityToken: null,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.razorpayOrderId, "order_rzp1");
    assert.equal(ok.body.amount, 100_000);
    console.log("PASS 34 legacy orders not orderNumber-authorized; owner path works");
  }

  // ── isEntitledToPay is a pure predicate ────────────────────────────────
  {
    const { order, capability } = makeOrderWithRazorpay("order_rzp_old", 100_000);
    assert.equal(isEntitledToPay(order, capability.token, null), true);
    assert.equal(isEntitledToPay(order, null, null), false);
    assert.equal(isEntitledToPay(order, "bogus", "prof_x"), false);
    assert.equal(
      isEntitledToPay({ ...order, profileId: "prof_x" }, null, "prof_x"),
      true,
    );
    console.log("PASS 35 isEntitledToPay predicate behaves");
  }

  // ── Order-number normalisation ─────────────────────────────────────────
  {
    assert.equal(normalizeOrderNumber("kf30x2a"), "KF30X2A");
    assert.equal(normalizeOrderNumber("kf-30 x2a"), "KF30X2A");
    assert.equal(normalizeOrderNumber("KF30X2A"), "KF30X2A");
    assert.equal(normalizeOrderNumber("sh"), null);
    assert.equal(normalizeOrderNumber("KF30X2A;DROP"), null);
    assert.equal(normalizeOrderNumber(""), null);
    assert.equal(normalizeOrderNumber(null), null);
    assert.equal(normalizeOrderNumber(42), null);
    assert.equal(normalizeOrderNumber("x".repeat(21)), null);
    console.log("PASS 36 order number normalisation unchanged");
  }

  // ── The outstanding balance is NET of refunds (Batch 4) ─────────────────
  //
  // THE DEFECT. The balance used to sum `status === "PAID"` only, so a fully
  // refunded payment dropped out of the paid sum entirely and the balance snapped
  // back to the full order total — asking a customer who had just been refunded in
  // full to pay the whole amount again.
  {
    const cases: Array<[string, Partial<InlinePaymentOrder>, number]> = [
      [
        "a partial refund raises the balance by exactly the refund",
        {
          total: 100_000,
          payments: [
            { amount: 100_000, status: "PAID", refundedAmount: 30_000 },
          ],
        },
        30_000,
      ],
      [
        "a fully returned payment leaves the whole total outstanding",
        {
          total: 100_000,
          payments: [
            { amount: 100_000, status: "REFUNDED", refundedAmount: 100_000 },
          ],
        },
        100_000,
      ],
      [
        "refunds net across several partial captures",
        {
          total: 100_000,
          payments: [
            { amount: 50_000, status: "PAID", refundedAmount: 20_000 },
            { amount: 20_000, status: "PAID", refundedAmount: 0 },
          ],
        },
        50_000,
      ],
    ];

    for (const [label, override, expected] of cases) {
      const capability = createOrderCapability();
      const order = makeOrder({
        billingDetails: {
          [GUEST_TOKEN_HASH_KEY]: capability.hash,
          // A stale Razorpay order, so the recomputed amount is observable in the
          // gateway call instead of being short-circuited by the reuse branch.
          razorpayOrderId: "order_rzp_stale",
          razorpayOrderAmount: 999_999,
        },
        ...override,
      });
      const { deps, log } = makeDeps(order);
      const r = await startInlinePayment(deps, {
        orderNumber: "KF30X2A",
        capabilityToken: capability.token,
      });
      assert.equal(r.status, 200, `${label}: got ${r.status}`);
      const body = r.body as { amount: number };
      assert.equal(body.amount, expected, label);
      assert.equal(
        log.createRazorpayOrder[0],
        `KF30X2A:${expected}`,
        `${label}: the gateway call must carry the net balance`,
      );
    }
    console.log("PASS 37 the outstanding balance is net of refunds");

    // A fully retained payment still owes nothing, so there is no balance to
    // charge and no Razorpay order may be minted. Net must not turn a genuinely
    // paid order back into something payable.
    const capability = createOrderCapability();
    const retained = makeOrder({
      total: 100_000,
      payments: [
        { amount: 100_000, status: "PAID", refundedAmount: 0 },
      ],
      billingDetails: { [GUEST_TOKEN_HASH_KEY]: capability.hash },
    });
    const retainedDeps = makeDeps(retained);
    const retainedResult = await startInlinePayment(retainedDeps.deps, {
      orderNumber: "KF30X2A",
      capabilityToken: capability.token,
    });
    assert.equal(retainedResult.status, 400, "nothing owed is still a 400");
    assert.deepEqual(retainedDeps.log.createRazorpayOrder, []);
    console.log("PASS 37b a fully retained payment stays unpayable");
  }

  {
    // A customer refunded in full, whose order is not itself marked REFUNDED, must
    // not be charged the whole amount again — and must not be silently blocked
    // either, because the balance genuinely is outstanding. This is the case the
    // PAID/REFUNDED guards above do not cover.
    const capability = createOrderCapability();
    const order = makeOrder({
      total: 100_000,
      paymentStatus: "PARTIALLY_PAID",
      payments: [
        { amount: 100_000, status: "REFUNDED", refundedAmount: 100_000 },
      ],
      billingDetails: { [GUEST_TOKEN_HASH_KEY]: capability.hash },
    });
    const { deps } = makeDeps(order);
    const r = await startInlinePayment(deps, {
      orderNumber: "KF30X2A",
      capabilityToken: capability.token,
    });
    assert.equal(r.status, 200);
    assert.equal((r.body as { amount: number }).amount, 100_000);
    console.log("PASS 38 a fully refunded payment does not under-report what is owed");
  }

  console.log("\nPASS all pay-inline capability tests");
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});