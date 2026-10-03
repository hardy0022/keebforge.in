import assert from "node:assert/strict";
import crypto from "node:crypto";
import Module from "node:module";
import path from "node:path";

/**
 * Route-level regressions for POST /api/payments/verify and
 * POST /api/payments/webhook.
 *
 * The decision cores are unit-tested elsewhere (razorpay-webhook.test.ts,
 * payment-status.test.ts, razorpay-signature.test.ts). What is only observable
 * here is the plumbing those cores cannot see: which database writes a request
 * is allowed to make, which orders it is allowed to touch, and what status a
 * delivery answers with. So prisma and the session helper are stubbed and the
 * real route handlers are driven directly — no server, no database.
 */

import { outstandingBalance } from "@/lib/payments/refund-accounting";

const REPO = path.resolve(__dirname, "../../..");
const PRISMA_PATH = path.join(REPO, "src/lib/db/prisma.ts");

type PrismaArgs = Record<string, unknown>;

type PaymentRow = {
  status: string;
  amount: number;
  refundedAmount: number;
  razorpayPaymentId: string | null;
};

/** The subset of an Order row the two handlers read. */
type OrderRow = {
  id: string;
  orderNumber: string;
  total: number;
  paymentStatus: string;
  status: string;
  customerEmail: string | null;
  profileId: string | null;
  isDeleted: boolean;
  billingDetails: Record<string, unknown>;
  payments: PaymentRow[];
};

type Write = { model: string; op: string };

/** A `Refund` row as stored, keyed by its unique razorpayRefundId. */
type RefundRow = {
  id: string;
  status: string;
  amount: number;
  paymentId: string | null;
};

/** A `Payment` row as stored. Mutated by tx writes so sequences are real. */
type PaymentRecord = {
  id: string;
  status: string;
  amount: number;
  refundedAmount: number;
  razorpayPaymentId: string | null;
};

const state = {
  /** Row returned for the order lookup; null models an unknown/deleted order. */
  order: null as OrderRow | null,
  /** Payment row returned by payment.findUnique (webhook only). */
  payment: null as PaymentRecord | null,
  /**
   * The refund ledger, keyed by razorpayRefundId. This replaces the old
   * timeline-note substring match and is what makes duplicate suppression
   * testable: a redelivery finds its row here and adds nothing.
   */
  refunds: new Map<string, RefundRow>(),
  /** Timeline notes already written. */
  timeline: [] as string[],
  /** Every write the handler attempted. */
  writes: [] as Write[],
  /** Number of $transaction calls — the signal that a write path was reached. */
  transactions: 0,
  /** Recorded call arguments, so the tests can assert on the query itself. */
  calls: [] as { fn: string; args: PrismaArgs }[],
  log: [] as string[],
  /**
   * Fires immediately before a guarded `payment.updateMany` is applied, i.e. in
   * the window between the transaction's read and its write. A test that mutates
   * `state.payment` from here is simulating a SECOND refund committing
   * concurrently — the exact interleaving that used to lose an update, because the
   * old code wrote an absolute `refundedAmount` computed from its stale read.
   */
  onBeforePaymentUpdateMany: null as null | (() => void),
  /**
   * Fires the first time this transaction writes the refund ledger row — an
   * upsert or a claim-style insert. Models a second delivery of the SAME refund
   * committing in the window between this transaction's read and its write.
   */
  onBeforeRefundLedgerWrite: null as null | (() => void),
  /**
   * Fires before a status-only Payment write. Models a refund webhook settling in
   * the window between this transaction's read and its write.
   */
  onBeforePaymentStatusWrite: null as null | (() => void),
};

function reset(overrides: Partial<typeof state> = {}) {
  state.order = null;
  state.payment = null;
  state.refunds = new Map();
  state.timeline = [];
  state.writes = [];
  state.transactions = 0;
  state.calls = [];
  state.log = [];
  state.onBeforePaymentUpdateMany = null;
  state.onBeforeRefundLedgerWrite = null;
  state.onBeforePaymentStatusWrite = null;
  Object.assign(state, overrides);
}

/** The `where` clause of the recorded call to `fn`. */
function whereOf(fn: string): Record<string, unknown> {
  const found = state.calls.find((c) => c.fn === fn);
  assert.ok(found, `${fn} must have been called`);
  return found.args["where"] as Record<string, unknown>;
}

/** Mirror a payment write onto the order's snapshot so sequences stay coherent. */
function applyPaymentWrite(data: PrismaArgs) {
  if (!state.payment) return;
  const refunded = data["refundedAmount"];
  if (typeof refunded === "number") state.payment.refundedAmount = refunded;
  const status = data["status"];
  if (typeof status === "string") state.payment.status = status;
  const row = state.order?.payments.find(
    (p) => p.razorpayPaymentId === state.payment?.razorpayPaymentId,
  );
  if (row) {
    if (typeof refunded === "number") row.refundedAmount = refunded;
    if (typeof status === "string") row.status = status;
  }
}

function txClient() {
  return {
    payment: {
      // Read inside the refund transaction. The refund money arithmetic must be
      // based on this, not on a read taken before the transaction opened.
      findUnique: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.payment.findUnique", args });
        state.log.push("tx.payment.findUnique");
        return state.payment;
      },
      upsert: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.payment.upsert", args });
        void state.writes.push({ model: "payment", op: "upsert" });
      },
      update: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.payment.update", args });
        void state.writes.push({ model: "payment", op: "update" });
        applyPaymentWrite(args["data"] as PrismaArgs);
      },
      createMany: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.payment.createMany", args });
        void state.writes.push({ model: "payment", op: "createMany" });
        if (args["skipDuplicates"] !== true) {
          throw new Error("stub: createMany without skipDuplicates is a unique violation");
        }
        const rows = args["data"] as Array<{
          razorpayPaymentId: string | null;
          amount: number;
          status: string;
        }>;
        let count = 0;
        for (const row of rows) {
          if (state.payment?.razorpayPaymentId === row.razorpayPaymentId) continue;
          state.payment = {
            id: `pay_${state.payment ? 2 : 1}`,
            status: row.status,
            amount: row.amount,
            refundedAmount: 0,
            razorpayPaymentId: row.razorpayPaymentId,
          };
          count += 1;
        }
        return { count };
      },
      /**
       * Models `UPDATE … WHERE id = ? AND <predicate>`, which Postgres executes by
       * taking the row lock and THEN re-evaluating the predicate against whatever
       * version is committed at that moment. That is what makes a guarded increment
       * and a guarded status write safe under concurrency, so the stub re-reads the
       * row after the "lock" instead of trusting the caller's stale snapshot.
       */
      updateMany: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.payment.updateMany", args });
        void state.writes.push({ model: "payment", op: "updateMany" });
        if (!state.payment) return { count: 0 };

        const where = (args["where"] ?? {}) as {
          refundedAmount?: { lte?: number };
          status?: { not?: string };
        };
        const data = (args["data"] ?? {}) as {
          refundedAmount?: { increment: number } | number;
          status?: string;
        };
        const increment =
          typeof data.refundedAmount === "object" && data.refundedAmount
            ? data.refundedAmount.increment
            : typeof data.refundedAmount === "number"
              ? data.refundedAmount
              : null;

        // The competing-refund hook fires only for a write that actually moves
        // money. A status-only update is not a competing refund, and letting the
        // hook clobber the figure on one would manufacture a failure the database
        // cannot produce.
        if (increment !== null) state.onBeforePaymentUpdateMany?.();
        else if (typeof data.status === "string") state.onBeforePaymentStatusWrite?.();

        const lte = where.refundedAmount?.lte;
        if (typeof lte === "number" && state.payment.refundedAmount > lte) {
          return { count: 0 };
        }
        if (where.status?.not && state.payment.status === where.status.not) {
          return { count: 0 };
        }

        if (increment !== null) state.payment.refundedAmount += increment;
        if (typeof data.status === "string") state.payment.status = data.status;

        const row = state.order?.payments.find(
          (p) => p.razorpayPaymentId === state.payment?.razorpayPaymentId,
        );
        // `paidOrder()` aliases order.payments[0] and the payment row to the SAME
        // object. Mirroring an increment onto it as well would count it twice, so
        // the order snapshot is only touched when it really is a separate row.
        if (row && row !== state.payment) {
          if (increment !== null) row.refundedAmount += increment;
          if (typeof data.status === "string") row.status = data.status;
        }
        return { count: 1 };
      },
      create: async () => void state.writes.push({ model: "payment", op: "create" }),
    },
    refund: {
      createMany: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.refund.createMany", args });
        void state.writes.push({ model: "refund", op: "createMany" });
        state.onBeforeRefundLedgerWrite?.();
        // `skipDuplicates` is ON CONFLICT DO NOTHING: it reports how many rows this
        // statement actually inserted, which is how a caller learns whether it is
        // the one that created the ledger entry. Crucially it does NOT abort the
        // transaction the way a plain unique violation would.
        if (!(args["skipDuplicates"] === true)) {
          throw new Error("stub: createMany without skipDuplicates is a unique violation");
        }
        const rows = args["data"] as Array<{
          razorpayRefundId: string;
          status?: string;
          amount?: number;
          paymentId?: string | null;
        }>;
        let count = 0;
        for (const row of rows) {
          if (state.refunds.has(row.razorpayRefundId)) continue;
          state.refunds.set(row.razorpayRefundId, {
            id: `re_${state.refunds.size + 1}`,
            paymentId: row.paymentId ?? null,
            status: row.status ?? "CREATED",
            amount: row.amount ?? 0,
          });
          count += 1;
        }
        return { count };
      },
      update: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.refund.update", args });
        void state.writes.push({ model: "refund", op: "update" });
        const where = args["where"] as { razorpayRefundId: string };
        const row = state.refunds.get(where.razorpayRefundId);
        if (!row) throw new Error("stub: refund.update on a missing row");
        const data = args["data"] as { paymentId?: string | null };
        if (typeof data.paymentId === "string" || data.paymentId === null) {
          row.paymentId = data.paymentId;
        }
        return row;
      },
      updateMany: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.refund.updateMany", args });
        void state.writes.push({ model: "refund", op: "updateMany" });
        const where = args["where"] as {
          razorpayRefundId: string;
          status?: { notIn?: string[]; not?: string };
        };
        const data = args["data"] as { status?: string };
        const row = state.refunds.get(where.razorpayRefundId);
        if (!row) return { count: 0 };
        // Postgres re-evaluates a row's WHERE after a concurrent writer releases
        // the lock, so a predicate on the CURRENT status is a real claim: exactly
        // one concurrent transaction can move a given row off a given phase.
        const notIn = where.status?.notIn;
        if (Array.isArray(notIn) && notIn.includes(row.status)) return { count: 0 };
        if (where.status?.not && where.status.not === row.status) return { count: 0 };
        if (typeof data.status === "string") row.status = data.status;
        return { count: 1 };
      },
      findUnique: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.refund.findUnique", args });
        const where = args["where"] as { razorpayRefundId: string };
        return state.refunds.get(where.razorpayRefundId) ?? null;
      },
      upsert: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.refund.upsert", args });
        void state.writes.push({ model: "refund", op: "upsert" });
        state.onBeforeRefundLedgerWrite?.();
        // Prisma's upsert takes where/create/update, never `data`.
        const where = args["where"] as { razorpayRefundId: string };
        const create = args["create"] as {
          status?: string;
          amount?: number;
          paymentId?: string | null;
        };
        const update = args["update"] as { status?: string };
        const existing = state.refunds.get(where.razorpayRefundId);
        // A redelivery updates only the phase: the refund's own amount is fixed
        // at creation, which is what stops a second payload with a different
        // figure from rewriting history.
        state.refunds.set(where.razorpayRefundId, existing
          ? { ...existing, status: update.status ?? existing.status }
          : {
              id: `re_${state.refunds.size + 1}`,
              paymentId: create.paymentId ?? null,
              status: create.status ?? "CREATED",
              amount: create.amount ?? 0,
            });
      },
    },
    order: {
      findFirst: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.order.findFirst", args });
        state.log.push("tx.order.findFirst");
        return state.order;
      },
      findUnique: async () => {
        state.log.push("tx.order.findUnique");
        return { paymentStatus: state.order?.paymentStatus ?? "PENDING" };
      },
      update: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.order.update", args });
        void state.writes.push({ model: "order", op: "update" });
        const status = (args["data"] as { paymentStatus?: string }).paymentStatus;
        if (status && state.order) state.order.paymentStatus = status;
      },
    },
    orderTimeline: {
      create: async (args: PrismaArgs) => {
        state.calls.push({ fn: "tx.orderTimeline.create", args });
        void state.writes.push({ model: "timeline", op: "create" });
        const note = (args["data"] as { note?: string }).note;
        if (note) state.timeline.push(note);
      },
    },
  };
}

/**
 * `@/lib/payments/billing-details` builds a raw query with `Prisma.sql` at
 * module scope, so the namespace stub has to be a working tagged template even
 * though these tests never run the code that uses it.
 */
function prismaSql(strings: TemplateStringsArray, ...values: unknown[]) {
  return strings.reduce(
    (out, chunk, i) => out + chunk + (i < values.length ? String(values[i]) : ""),
    "",
  );
}

const prismaStub = {
  order: {
    findFirst: async (args: PrismaArgs) => {
      state.log.push("order.findFirst");
      state.calls.push({ fn: "order.findFirst", args });
      return state.order;
    },
    findUnique: async (args: PrismaArgs) => {
      state.log.push("order.findUnique");
      state.calls.push({ fn: "order.findUnique", args });
      return state.order;
    },
  },
  payment: {
    findUnique: async (args: PrismaArgs) => {
      state.log.push("payment.findUnique");
      state.calls.push({ fn: "payment.findUnique", args });
      return state.payment;
    },
  },
  refund: {
    findUnique: async (args: PrismaArgs) => {
      state.log.push("refund.findUnique");
      state.calls.push({ fn: "refund.findUnique", args });
      const where = args["where"] as { razorpayRefundId: string };
      return state.refunds.get(where.razorpayRefundId) ?? null;
    },
  },
  $transaction: async (arg: unknown) => {
    state.transactions += 1;
    if (Array.isArray(arg)) {
      return Promise.all(arg as Promise<unknown>[]);
    }
    return (arg as (tx: ReturnType<typeof txClient>) => Promise<unknown>)(txClient());
  },
};

/**
 * Swap prisma, the tracking-cache rebuild and the session helper for in-process
 * stubs. package.json is CommonJS, so under tsx the routes' `import` statements
 * resolve through Module._load and a local override intercepts them. Defined here
 * rather than in a shared require hook so this test stays self-contained.
 */
function installStubs() {
  const mod = Module as unknown as {
    _load: (
      this: unknown,
      request: string,
      parent: { filename?: string } | null,
      main: boolean,
    ) => unknown;
    __peStubbed?: boolean;
  };
  if (mod.__peStubbed) return;
  const orig = mod._load;
  mod._load = function (request, parent, main) {
    const resolved = request.startsWith(".")
      ? path.resolve(path.dirname(parent?.filename ?? REPO), request)
      : request;
    if (
      resolved === "@/lib/db/prisma" ||
      resolved === PRISMA_PATH ||
      resolved.endsWith("/src/lib/db/prisma.ts")
    ) {
      return { prisma: prismaStub, Prisma: { sql: prismaSql } };
    }
    if (
      resolved === "@/lib/orders/tracking" ||
      resolved.endsWith("/src/lib/orders/tracking.ts")
    ) {
      return {
        syncTrackingCache: async (orderId: string) => {
          state.log.push(`syncTrackingCache(${orderId})`);
        },
      };
    }
    if (
      resolved === "@/lib/auth/session" ||
      resolved.endsWith("/src/lib/auth/session.ts")
    ) {
      return { getCurrentAuth: async () => ({ user: null, profile: null }) };
    }
    // `server-only` is supplied by Next.js and has no node resolution, so tsx
    // cannot load any module that imports it. Next only uses it to fail a build
    // when one reaches a client component; an empty module is what it resolves
    // to on the server, which is all these handlers need.
    if (request === "server-only") return {};
    return orig.call(this, request, parent, main);
  };
  mod.__peStubbed = true;
}
installStubs();

(async () => {
  const { NextRequest } = await import("next/server");
  const { resetRateLimits } = await import("@/lib/payments/rate-limit");
  const { razorpayCheckoutSignature } = await import(
    "@/lib/payments/razorpay-signature"
  );
  const verifyRoute = await import(
    path.join(REPO, "src/app/api/payments/verify/route.ts")
  );
  const webhookRoute = await import(
    path.join(REPO, "src/app/api/payments/webhook/route.ts")
  );
  const verifyPost = verifyRoute.POST as (req: unknown) => Promise<Response>;
  const webhookPost = webhookRoute.POST as (req: unknown) => Promise<Response>;

  const KEY_SECRET = "rzp_test_key_secret";
  const WEBHOOK_SECRET = "whsec_test_secret";
  process.env.RAZORPAY_KEY_SECRET = KEY_SECRET;
  process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

  let n = 0;
  const pass = (label: string) => console.log(`PASS ${++n} ${label}`);

  const ORDER: OrderRow = {
    id: "ord_1",
    orderNumber: "KFTEST0001",
    total: 100_000,
    paymentStatus: "PENDING",
    status: "PAYMENT_PENDING",
    customerEmail: "buyer@example.com",
    profileId: "prof_1",
    isDeleted: false,
    billingDetails: {
      razorpayOrderId: "order_ABC",
      razorpayCustomerId: "cust_1",
      razorpayOrderAmount: 100_000,
    },
    payments: [],
  };

  const sign = (paymentId: string) =>
    razorpayCheckoutSignature("order_ABC", paymentId, KEY_SECRET);

  function post(
    handler: (req: unknown) => Promise<Response>,
    url: string,
    body: string,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    return handler(
      new NextRequest(`http://localhost${url}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
      }),
    );
  }

  const verify = (body: unknown, headers: Record<string, string> = {}) =>
    post(verifyPost, "/api/payments/verify", JSON.stringify(body), headers);

  const webhook = (raw: string, headers: Record<string, string> = {}) => {
    const signature = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(raw)
      .digest("hex");
    return post(webhookPost, "/api/payments/webhook", raw, {
      "x-razorpay-signature": signature,
      ...headers,
    });
  };

  /**
   * A real-shaped Razorpay refund event. `amount_refunded` is the cumulative
   * figure Razorpay repeats on every delivery, which is why it is supplied
   * separately from this refund's own amount.
   */
  function refundEvent(args: {
    event?: string;
    refundId: string;
    amount: number;
    paymentId?: string;
    cumulative?: number;
    orderId?: string;
    paymentAmount?: number;
  }) {
    return JSON.stringify({
      event: args.event ?? "refund.processed",
      payload: {
        refund: {
          entity: {
            id: args.refundId,
            amount: args.amount,
            payment_id: args.paymentId ?? "pay_MAIN",
            status: "processed",
          },
        },
        payment: {
          entity: {
            id: args.paymentId ?? "pay_MAIN",
            amount: args.paymentAmount ?? 100_000,
            order_id: args.orderId ?? "order_ABC",
            amount_refunded: args.cumulative ?? args.amount,
            refund_status: "partial",
            status: "captured",
            captured: true,
          },
        },
      },
    });
  }

  /** An order with one fully-captured payment, as the webhook expects to find. */
  const paidOrder = (payment: Partial<PaymentRecord> = {}) => {
    const row: PaymentRecord = {
      id: "pay_row_1",
      status: "PAID",
      amount: 100_000,
      refundedAmount: 0,
      razorpayPaymentId: "pay_MAIN",
      ...payment,
    };
    const order: OrderRow = {
      ...ORDER,
      paymentStatus: "PAID",
      status: "PAYMENT_RECEIVED",
      payments: [row],
    };
    return { order, payment: row };
  };

  /** A refund.processed for an order this app does not have. */
  const REFUND_BODY = JSON.stringify({
    event: "refund.processed",
    payload: {
      refund: {
        entity: {
          id: "rfnd_ORPHAN",
          amount: 50_000,
          payment_id: "pay_GONE",
          status: "processed",
        },
      },
      payment: {
        entity: {
          id: "pay_GONE",
          amount: 100_000,
          status: "captured",
          order_id: "order_DOES_NOT_EXIST",
          amount_refunded: 50_000,
          refund_status: "partial",
          captured: true,
        },
      },
    },
  });

  // ── 1. Soft-deleted orders are invisible to both endpoints ────────────────
  {
    reset({ order: null });
    const res = await verify({
      orderId: "ord_1",
      razorpay_order_id: "order_ABC",
      razorpay_payment_id: "pay_1",
      razorpay_signature: sign("pay_1"),
    });
    assert.equal(res.status, 404, "a soft-deleted order must not verify");
    assert.equal(state.writes.length, 0, "and must not be written to");
    assert.equal(
      whereOf("order.findFirst").isDeleted,
      false,
      "the lookup must filter on isDeleted: false",
    );
    pass("verify refuses a soft-deleted order and filters on isDeleted");
  }

  {
    reset({ order: null });
    const res = await webhook(REFUND_BODY);
    assert.equal(res.status, 200, "a webhook for a deleted order still acks");
    assert.equal(state.writes.length, 0);
    assert.equal(
      whereOf("order.findFirst").isDeleted,
      false,
      "the webhook order lookup must filter on isDeleted: false",
    );
    pass("the webhook order lookup filters on isDeleted");
  }

  // ── 2. An invalid signature writes nothing at all ─────────────────────────
  {
    reset({ order: { ...ORDER } });
    const res = await verify({
      orderId: "ord_1",
      razorpay_order_id: "order_ABC",
      razorpay_payment_id: "pay_ATTACKER",
      razorpay_signature: "f".repeat(64),
    });
    assert.equal(res.status, 400);
    assert.equal(
      state.transactions,
      0,
      "no transaction may be opened on a failed signature",
    );
    assert.equal(state.writes.length, 0, "no Payment row");
    pass("an invalid signature creates no Payment and no timeline entry");
  }

  {
    // THE AMPLIFICATION DEFECT: the handler used to upsert a FAILED Payment and
    // append a timeline entry keyed on an attacker-chosen razorpay_payment_id,
    // so rotating that id grew the database without bound while inflating the
    // admin FAILED tile.
    reset({ order: { ...ORDER } });
    for (let i = 0; i < 50; i++) {
      // The limiter is cleared each round so this isolates the write behaviour:
      // the answer must be a plain rejection even when nothing is throttling.
      resetRateLimits();
      const res = await verify({
        orderId: "ord_1",
        razorpay_order_id: "order_ABC",
        razorpay_payment_id: `pay_FORGED_${i}`,
        razorpay_signature: "f".repeat(64),
      });
      assert.equal(res.status, 400, `request ${i} must be a plain rejection`);
    }
    assert.equal(
      state.writes.length,
      0,
      "50 forged payment ids must produce zero rows",
    );
    assert.equal(state.transactions, 0);
    pass("50 forged payment ids produce zero rows — no write amplification");
  }

  {
    // A valid signature still settles the order, so removing the failure write
    // did not break the success path.
    reset({ order: { ...ORDER } });
    resetRateLimits();
    const res = await verify({
      orderId: "ord_1",
      razorpay_order_id: "order_ABC",
      razorpay_payment_id: "pay_REAL",
      razorpay_signature: sign("pay_REAL"),
    });
    assert.equal(res.status, 200);
    assert.ok(
      state.writes.some((w) => w.model === "payment"),
      "the payment is still recorded",
    );
    assert.ok(
      state.writes.some((w) => w.model === "order"),
      "the order is still settled",
    );
    pass("a valid signature still records the payment and settles the order");
  }

  // ── 3. Refunds write to the Refund ledger and move money exactly once ────
  {
    // A partial refund: records the Refund row, adds exactly its own amount to
    // Payment.refundedAmount, and leaves the payment and the order PAID so the
    // remaining 70 000 stays outstanding.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    const res = await webhook(
      refundEvent({ refundId: "rfnd_A", amount: 30_000, cumulative: 30_000 }),
    );
    assert.equal(res.status, 200);
    assert.equal(payment.refundedAmount, 30_000, "exactly this refund's amount");
    assert.equal(payment.status, "PAID", "a partial refund leaves the payment PAID");
    assert.equal(order.paymentStatus, "PAID", "and the order PAID");
    assert.equal(state.refunds.get("rfnd_A")?.status, "PROCESSED");
    assert.equal(state.refunds.get("rfnd_A")?.amount, 30_000);
    assert.equal(
      state.refunds.size,
      1,
      "one Refund row is recorded — the ledger write is a claim, not an insert "
        + "per delivery, so more than one statement may touch the model",
    );
    pass("a partial refund records the ledger row and only its own amount");
  }

  {
    // The retry defect Batch 3 fixed must stay fixed: an unknown order acks 200
    // rather than throwing on `order!.id` and telling Razorpay to retry forever.
    reset({ order: null });
    const res = await webhook(REFUND_BODY);
    assert.equal(res.status, 200, "must ack, not 500 — a 500 causes endless retries");
    assert.equal(state.writes.length, 0);
    assert.equal(
      state.refunds.size,
      0,
      "an order we do not have gets no Refund row",
    );
    pass("a refund for an order we do not have answers 200 with no writes");
  }

  {
    // A refund with no local Payment row reconciles rather than throwing (a
    // refund can outrun a lost capture event).
    const { order } = paidOrder();
    reset({ order, payment: null });
    const res = await webhook(
      refundEvent({ refundId: "rfnd_NOPAY", amount: 50_000 }),
    );
    assert.equal(res.status, 200, "a missing Payment row must not fail the delivery");
    assert.ok(
      state.writes.some((w) => w.model === "refund"),
      "the refund is still recorded against the order",
    );
    assert.equal(
      state.writes.some((w) => w.model === "payment"),
      false,
      "there is no Payment row to update",
    );
    assert.equal(state.refunds.get("rfnd_NOPAY")?.paymentId ?? null, null);
    pass("a refund with no local Payment row reconciles without failing");
  }

  {
    // A full refund returns the whole capture: the payment and the order both
    // become REFUNDED, and nothing is retained.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    const res = await webhook(
      refundEvent({ refundId: "rfnd_FULL", amount: 100_000, cumulative: 100_000 }),
    );
    assert.equal(res.status, 200);
    assert.equal(payment.refundedAmount, 100_000);
    assert.equal(payment.status, "REFUNDED");
    assert.equal(order.paymentStatus, "REFUNDED");
    pass("a full refund marks the payment and the order REFUNDED");
  }

  {
    // F6/F7 — Batch 5A. This assertion INVERTS the one Batch 4 wrote, and the
    // inversion is the whole point of the fix.
    //
    // A 100 000 order whose only capture was 50 000, with that 50 000 returned.
    // `isFullyRefunded` is true — nothing is retained — so Batch 4 closed the
    // order as REFUNDED. But 100 000 is still owed, because the un-captured
    // remainder was never paid, and REFUNDED blocks pay-inline outright. The
    // balance was unreachable from both ends: the customer could not pay it, and
    // an admin could not clear it either, because `derivePaymentStatus` returns
    // REFUNDED for a REFUNDED order no matter what has since been recorded. (The
    // Batch 4 note claiming `recordOrderPayment` was an escape hatch was wrong.)
    //
    // The discriminator is whether the order ever held its full worth. It did not,
    // so the order stays PARTIALLY_PAID and the balance stays payable.
    const { order, payment } = paidOrder({ amount: 50_000 });
    order.total = 100_000;
    order.paymentStatus = "PARTIALLY_PAID";
    reset({ order, payment });
    const res = await webhook(
      refundEvent({
        refundId: "rfnd_PARTIALCAP",
        amount: 50_000,
        cumulative: 50_000,
        paymentAmount: 50_000,
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(payment.refundedAmount, 50_000);
    assert.equal(payment.status, "REFUNDED", "the payment really was fully returned");
    assert.equal(
      order.paymentStatus,
      "PARTIALLY_PAID",
      "the order never held its full worth, so it must not close as REFUNDED",
    );
    assert.equal(
      outstandingBalance({ total: order.total, payments: order.payments }),
      100_000,
      "the whole total is genuinely still owed and must stay collectable",
    );
    pass("a refunded partial capture keeps the order payable instead of stranding it");
  }

  {
    // F6/F7, the mirror image — and the protection that must NOT be weakened.
    // Here the order WAS paid in full and all of it came back. Nothing is owed
    // now and nothing ever will be, so the order closes. Gating on "was ever
    // fully settled" rather than "is the balance zero" is what keeps a customer
    // who has just been refunded in full from being invited to pay it again.
    const { order, payment } = paidOrder({ amount: 100_000 });
    order.total = 100_000;
    order.paymentStatus = "PAID";
    reset({ order, payment });
    const res = await webhook(
      refundEvent({
        refundId: "rfnd_FULLPAID",
        amount: 100_000,
        cumulative: 100_000,
        paymentAmount: 100_000,
      }),
    );
    assert.equal(res.status, 200);
    assert.equal(payment.refundedAmount, 100_000);
    assert.equal(
      order.paymentStatus,
      "REFUNDED",
      "a fully paid order that came back in full stays closed",
    );
    assert.equal(
      outstandingBalance({ total: order.total, payments: order.payments }),
      100_000,
      "net is zero, but it must NOT be re-collectable — that is the duplicate collection",
    );
    pass("a fully paid order refunded in full stays closed and is never re-charged");
  }

  {
    // F6/F7, the third case: a fully paid order with only PART of the money
    // returned is neither "refunded" nor "re-collectable". It was paid in full,
    // so the order must not close, and 30 000 was genuinely given back, so the
    // outstanding balance must be 100 000 and not 70 000.
    const { order, payment } = paidOrder({ amount: 100_000 });
    order.total = 100_000;
    order.paymentStatus = "PAID";
    reset({ order, payment });
    const res = await webhook(
      refundEvent({ refundId: "rfnd_GOODWILL", amount: 30_000, cumulative: 30_000 }),
    );
    assert.equal(res.status, 200);
    assert.equal(payment.refundedAmount, 30_000);
    assert.equal(payment.status, "PAID", "a partial refund leaves the payment PAID");
    assert.equal(order.paymentStatus, "PAID", "and the order PAID");
    assert.equal(
      outstandingBalance({ total: order.total, payments: order.payments }),
      30_000,
      "net retained is 70 000 of a 100 000 order, so 30 000 is still owed",
    );
    pass("a partial refund of a paid order nets the balance without closing it");
  }

  {
    // Duplicate suppression, the property the unique razorpayRefundId buys.
    // Delivered twice, the payment must be debited once.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    const body = refundEvent({ refundId: "rfnd_DUP", amount: 30_000 });
    await webhook(body);
    assert.equal(payment.refundedAmount, 30_000);
    const writesAfterFirst = state.writes.length;
    for (let i = 0; i < 5; i++) {
      const res = await webhook(body);
      assert.equal(res.status, 200, "a redelivery still acks");
    }
    assert.equal(
      payment.refundedAmount,
      30_000,
      "five redeliveries must not add five refunds",
    );
    assert.equal(
      state.writes.length,
      writesAfterFirst,
      "a settled redelivery writes nothing at all",
    );
    assert.equal(state.refunds.size, 1, "one Refund row, not six");
    pass("a redelivered refund.processed is applied exactly once");
  }

  {
    // The substring-dedupe defect, exactly: `rfnd_ABC` as a prefix of
    // `rfnd_ABCDEF`. The old timeline-note `contains` match made the second
    // refund look already-recorded and silently dropped real money.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    await webhook(refundEvent({ refundId: "rfnd_ABCDEF", amount: 10_000 }));
    assert.equal(payment.refundedAmount, 10_000);
    const res = await webhook(refundEvent({ refundId: "rfnd_ABC", amount: 20_000 }));
    assert.equal(res.status, 200);
    assert.equal(
      payment.refundedAmount,
      30_000,
      "a refund id that is a prefix of another is still a distinct refund",
    );
    assert.equal(state.refunds.size, 2);
    pass("refund ids that are prefixes of one another are both applied");
  }

  {
    // Several partial refunds against the same payment accumulate.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    await webhook(refundEvent({ refundId: "rfnd_1", amount: 20_000, cumulative: 20_000 }));
    await webhook(refundEvent({ refundId: "rfnd_2", amount: 30_000, cumulative: 50_000 }));
    assert.equal(payment.refundedAmount, 50_000, "20 000 + 30 000");
    assert.equal(payment.status, "PAID", "still partial");
    const last = await webhook(
      refundEvent({ refundId: "rfnd_3", amount: 50_000, cumulative: 100_000 }),
    );
    assert.equal(last.status, 200);
    assert.equal(payment.refundedAmount, 100_000);
    assert.equal(payment.status, "REFUNDED", "the third refund completes it");
    assert.equal(order.paymentStatus, "REFUNDED");
    assert.equal(state.refunds.size, 3);
    pass("three partial refunds on one payment accumulate to a full refund");
  }

  {
    // refund.created records intent and moves no money...
    const { order, payment } = paidOrder();
    reset({ order, payment });
    const res = await webhook(
      refundEvent({ event: "refund.created", refundId: "rfnd_LIFE", amount: 25_000 }),
    );
    assert.equal(res.status, 200);
    assert.equal(state.refunds.get("rfnd_LIFE")?.status, "CREATED");
    assert.equal(payment.refundedAmount, 0, "initiation is not settlement");
    assert.equal(payment.status, "PAID");
    assert.equal(order.paymentStatus, "PAID");
    pass("refund.created is recorded without moving any money");

    // ...and the matching refund.processed then settles it exactly once.
    const settled = await webhook(
      refundEvent({ refundId: "rfnd_LIFE", amount: 25_000, cumulative: 25_000 }),
    );
    assert.equal(settled.status, 200);
    assert.equal(state.refunds.get("rfnd_LIFE")?.status, "PROCESSED");
    assert.equal(payment.refundedAmount, 25_000, "settled exactly once");
    pass("the later refund.processed for a created refund settles it once");
  }

  {
    // refund.failed is recorded, and moves nothing at all.
    const { order, payment } = paidOrder({ refundedAmount: 20_000 });
    reset({ order, payment });
    const res = await webhook(
      refundEvent({ event: "refund.failed", refundId: "rfnd_BAD", amount: 40_000 }),
    );
    assert.equal(res.status, 200);
    assert.equal(state.refunds.get("rfnd_BAD")?.status, "FAILED");
    assert.equal(payment.refundedAmount, 20_000, "unchanged");
    assert.equal(payment.status, "PAID", "a failed refund cannot refund a payment");
    assert.equal(order.paymentStatus, "PAID", "nor the order");
    pass("refund.failed is recorded and moves no money");

    // And it is itself idempotent.
    const writesAfter = state.writes.length;
    const again = await webhook(
      refundEvent({ event: "refund.failed", refundId: "rfnd_BAD", amount: 40_000 }),
    );
    assert.equal(again.status, 200);
    assert.equal(state.writes.length, writesAfter, "a redelivered failure writes nothing");
    pass("a redelivered refund.failed is idempotent");
  }

  {
    // A failed refund that Razorpay retries as a NEW refund id must still settle.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    await webhook(
      refundEvent({ event: "refund.failed", refundId: "rfnd_TRY1", amount: 40_000 }),
    );
    await webhook(refundEvent({ refundId: "rfnd_TRY2", amount: 40_000 }));
    assert.equal(payment.refundedAmount, 40_000, "the retry settles; the failure did not");
    assert.equal(state.refunds.size, 2);
    pass("a new refund id after a failure settles while the failure stays recorded");
  }

  {
    // A refund larger than the capture is clamped, so a malformed payload cannot
    // push the ledger negative.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    const res = await webhook(
      refundEvent({ refundId: "rfnd_HUGE", amount: 999_999, cumulative: 999_999 }),
    );
    assert.equal(res.status, 200);
    assert.equal(payment.refundedAmount, 100_000, "clamped to the capture");
    pass("a refund larger than the capture is clamped");
  }


  // ── 4. Rate limiting on verify ────────────────────────────────────────────
  {
    reset({ order: { ...ORDER } });
    resetRateLimits();
    const body = {
      orderId: "ord_1",
      razorpay_order_id: "order_ABC",
      razorpay_payment_id: "pay_1",
      razorpay_signature: "f".repeat(64),
    };
    let saw429 = false;
    for (let i = 0; i < 40; i++) {
      const res = await verify(body, { "x-forwarded-for": "203.0.113.1" });
      if (res.status === 429) {
        saw429 = true;
        assert.ok(res.headers.get("Retry-After"), "a 429 carries Retry-After");
        break;
      }
    }
    assert.equal(saw429, true, "a burst from one client must be throttled");
    pass("verify throttles a burst from a single client with 429");
  }

  {
    // The per-order limit is the one an IP-only limiter misses: rotating proxies
    // against a single known order is the actual attack.
    reset({ order: { ...ORDER } });
    resetRateLimits();
    const body = {
      orderId: "ord_1",
      razorpay_order_id: "order_ABC",
      razorpay_payment_id: "pay_1",
      razorpay_signature: "f".repeat(64),
    };
    let saw429 = false;
    for (let i = 0; i < 30; i++) {
      const res = await verify(body, { "x-forwarded-for": `198.51.100.${i}` });
      if (res.status === 429) {
        saw429 = true;
        break;
      }
    }
    assert.equal(
      saw429,
      true,
      "many client IPs against one order must still be throttled",
    );
    pass("verify throttles one order even behind rotating client IPs");
  }

  {
    // A blocked request must not reach the database at all.
    reset({ order: { ...ORDER } });
    resetRateLimits();
    const body = {
      orderId: "ord_2",
      razorpay_order_id: "order_ABC",
      razorpay_payment_id: "pay_1",
      razorpay_signature: "f".repeat(64),
    };
    for (let i = 0; i < 12; i++) {
      await verify(body, { "x-forwarded-for": "203.0.113.55" });
    }
    reset();
    await verify(body, { "x-forwarded-for": "203.0.113.55" });
    assert.equal(state.calls.length, 0, "a throttled request does no database work");
    pass("a throttled verify performs no database work");
  }

  {
    // Guest checkout with no session must still work — no auth anywhere in this
    // path, and the limiter must not become an auth gate in disguise.
    reset({ order: { ...ORDER } });
    resetRateLimits();
    const res = await verify(
      {
        orderId: "ord_1",
        razorpay_order_id: "order_ABC",
        razorpay_payment_id: "pay_GUEST",
        razorpay_signature: sign("pay_GUEST"),
      },
      { "x-forwarded-for": "203.0.113.77" },
    );
    assert.equal(res.status, 200, "an unauthenticated guest can still verify");
    pass("guest checkout still verifies without a session");
  }

  {
    // Partial payments: the balance capture must still verify and still settle
    // the order (Batch 2 behaviour, unchanged).
    reset({
      order: {
        ...ORDER,
        paymentStatus: "PARTIALLY_PAID",
        billingDetails: { ...ORDER.billingDetails, razorpayOrderAmount: 50_000 },
        payments: [
          {
            status: "PAID",
            amount: 50_000,
            refundedAmount: 0,
            razorpayPaymentId: "pay_FIRST",
          },
        ],
      },
    });
    resetRateLimits();
    const res = await verify(
      {
        orderId: "ord_1",
        razorpay_order_id: "order_ABC",
        razorpay_payment_id: "pay_SECOND",
        razorpay_signature: sign("pay_SECOND"),
      },
      { "x-forwarded-for": "203.0.113.88" },
    );
    assert.equal(res.status, 200);
    pass("a balance capture on a partially-paid order still verifies");
  }

  // ── 5. The webhook is NOT rate limited ───────────────────────────────────
  {
    // Razorpay redelivers on its own schedule, and a dropped delivery is a lost
    // payment record. Throttling here would lose real money.
    reset({ order: { ...ORDER } });
    let allOk = true;
    for (let i = 0; i < 60; i++) {
      const res = await webhook(REFUND_BODY);
      if (res.status !== 200) allOk = false;
    }
    assert.equal(allOk, true, "every webhook delivery must be answered 200");
    pass("60 webhook deliveries are all answered — Razorpay retries are unaffected");
  }

  // ── 6. Order creation is rate limited ────────────────────────────────────
  {
    // Both of these mint a real Razorpay order (a paid API call) and write an
    // Order row, so an unbounded loop is a bill and a spam channel. The limiter
    // is the first statement in each handler, which is what makes this testable
    // without a database: only the 429 path is exercised, everything below the
    // guard is never reached.
    const createOrderRoutes = await Promise.all([
      import(path.join(REPO, "src/app/api/payments/create-order/route.ts")),
      import(path.join(REPO, "src/app/api/services/create-order/route.ts")),
    ]);
    const labels = ["payments/create-order", "services/create-order"];
    const handlers = createOrderRoutes.map((r) => r.POST as (req: unknown) => Promise<Response>);

    for (const [i, handler] of handlers.entries()) {
      reset();
      resetRateLimits();
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 18; attempt++) {
        statuses.push(
          (
            await post(handler, "/api/payments/create-order", "{}", {
              "x-forwarded-for": "203.0.113.200",
            })
          ).status,
        );
      }
      assert.notEqual(
        statuses[0],
        429,
        `${labels[i]} must serve the first request normally`,
      );
      assert.equal(
        statuses.slice(0, 15).filter((s) => s === 429).length,
        0,
        `${labels[i]} must not throttle within its 15/minute budget`,
      );
      for (const status of statuses.slice(15)) {
        assert.equal(status, 429, `${labels[i]} must throttle past its budget`);
      }
      assert.equal(state.calls.length, 0, `${labels[i]} throttled without touching the database`);
      pass(`${labels[i]} throttles at 15 requests a minute`);
    }

    // A second client is unaffected by the first one's spending the budget.
    reset();
    resetRateLimits();
    const first = handlers[0];
    for (let attempt = 0; attempt < 16; attempt++) {
      await post(first, "/api/payments/create-order", "{}", {
        "x-forwarded-for": "203.0.113.201",
      });
    }
    const other = await post(first, "/api/payments/create-order", "{}", {
      "x-forwarded-for": "203.0.113.202",
    });
    assert.notEqual(other.status, 429, "one client's budget must not throttle another");
    pass("a different client is not throttled by another's usage");
  }

  {
    // The webhook still rejects a forged signature, from any volume.
    const res = await post(webhookPost, "/api/payments/webhook", REFUND_BODY, {
      "x-razorpay-signature": "deadbeef",
    });
    assert.equal(res.status, 400, "a forged webhook signature is rejected");
    pass("a forged webhook signature is still rejected");
  }


  // ── 3x. F1: a delayed refund.failed must not un-refund a settled refund ────
  {
    // THE DEFECT. The FAILED branch was evaluated before the
    // `existing.status === "PROCESSED"` guard, so a delayed `refund.failed` for a
    // refund that had already settled returned a write plan, and the upsert set
    // `status: phase` unconditionally. The ledger then recorded a refund that
    // returned money as FAILED — the one claim an admin must never read before
    // deciding whether a customer still needs refunding.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    const processed = await webhook(
      refundEvent({ refundId: "rfnd_LATE", amount: 30_000 }),
    );
    assert.equal(processed.status, 200);
    assert.equal(state.refunds.get("rfnd_LATE")?.status, "PROCESSED");
    const writesAfterSettle = state.writes.length;
    const timelineAfterSettle = state.timeline.length;

    const failed = await webhook(
      refundEvent({
        event: "refund.failed",
        refundId: "rfnd_LATE",
        amount: 30_000,
      }),
    );
    assert.equal(failed.status, 200, "a delayed failure must ack, not 500");
    assert.equal(
      state.refunds.get("rfnd_LATE")?.status,
      "PROCESSED",
      "PROCESSED is terminal — a later refund.failed cannot downgrade it",
    );
    assert.equal(payment.refundedAmount, 30_000, "and no money moved");
    assert.equal(
      state.writes.length,
      writesAfterSettle,
      "a downgraded event writes nothing at all",
    );
    assert.equal(state.timeline.length, timelineAfterSettle, "no extra timeline entry");
    pass("a delayed refund.failed cannot downgrade a settled refund");
  }

  // ── 3x. F5: a redelivered refund.created must not duplicate the timeline ──
  {
    const { order, payment } = paidOrder();
    reset({ order, payment });
    const body = refundEvent({
      event: "refund.created",
      refundId: "rfnd_INIT",
      amount: 30_000,
    });

    const first = await webhook(body);
    assert.equal(first.status, 200);
    assert.equal(state.timeline.length, 1, "one initiation note");
    assert.equal(state.refunds.get("rfnd_INIT")?.status, "CREATED");
    assert.equal(payment.refundedAmount, 0, "an initiation moves no money");

    // Razorpay redelivers anything it did not get a 2xx for, and can redeliver on
    // a schedule. Every copy used to append another "Refund initiated" entry to
    // the customer-visible timeline.
    for (let i = 0; i < 4; i++) {
      const again = await webhook(body);
      assert.equal(again.status, 200);
    }
    assert.equal(
      state.timeline.length,
      1,
      "five deliveries of refund.created must produce one timeline entry",
    );
    assert.equal(
      state.refunds.size,
      1,
      "and still exactly one Refund row",
    );

    // Settlement must still get through: the initiation guard must not freeze
    // the refund at CREATED.
    const settled = await webhook(
      refundEvent({ refundId: "rfnd_INIT", amount: 30_000 }),
    );
    assert.equal(settled.status, 200);
    assert.equal(state.refunds.get("rfnd_INIT")?.status, "PROCESSED");
    assert.equal(payment.refundedAmount, 30_000, "settlement moves the money once");
    assert.equal(state.timeline.length, 2, "initiation plus settlement");
    pass("duplicate refund.created events append no duplicate timeline entries");
  }

  // ── 3x. F2: a refund with no amount of its own must move no money ─────────
  {
    // `refund.entity.amount` absent, so `amount_refunded` (the CUMULATIVE figure
    // across every refund on the payment) was used as this refund's delta. On the
    // second refund that turned a 30 000 refund into a 60 000 delta and wrote 90 000
    // refunded against a payment where only 60 000 had come back.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    await webhook(refundEvent({ refundId: "rfnd_FIRST", amount: 30_000 }));
    assert.equal(payment.refundedAmount, 30_000);

    // A second refund whose own amount is missing, on a payload whose cumulative
    // field still reports 60 000.
    const noAmount = JSON.stringify({
      event: "refund.processed",
      payload: {
        refund: { entity: { id: "rfnd_SECOND", payment_id: "pay_MAIN" } },
        payment: {
          entity: {
            id: "pay_MAIN",
            amount: 100_000,
            order_id: "order_ABC",
            amount_refunded: 60_000,
            status: "captured",
            captured: true,
          },
        },
      },
    });
    const res = await webhook(noAmount);
    assert.equal(res.status, 200, "an unpriceable refund is acknowledged");
    assert.equal(
      payment.refundedAmount,
      30_000,
      "the cumulative 60 000 must never be applied as this refund's delta",
    );
    assert.equal(
      state.refunds.get("rfnd_SECOND"),
      undefined,
      "and nothing is recorded for a refund we cannot price",
    );
    pass("a refund with no amount of its own moves no money and is acknowledged");
  }

  // ── 3x. F4: concurrent refunds must both land ─────────────────────────────
  {
    // THE DEFECT. The payment and refund rows were read BEFORE the transaction
    // opened, and the write inside it was an ABSOLUTE `refundedAmount`. Two
    // refunds settling at once both read the same starting value, both computed
    // the same absolute total, and the second write discarded the first — so the
    // order appeared to still hold money Razorpay had already returned, and kept
    // a balance that no longer existed.
    //
    // Simulated here by committing a second refund in the window between this
    // transaction's read and its write — exactly the interleaving that lost the
    // update.
    const { order, payment } = paidOrder();
    reset({ order, payment });

    let injected = false;
    state.onBeforePaymentUpdateMany = () => {
      if (injected) return;
      injected = true;
      // Another refund of 20 000 commits while this one is mid-transaction.
      payment.refundedAmount += 20_000;
    };

    const res = await webhook(
      refundEvent({ refundId: "rfnd_RACE", amount: 30_000 }),
    );
    assert.equal(res.status, 200);
    state.onBeforePaymentUpdateMany = null;
    assert.equal(
      payment.refundedAmount,
      50_000,
      "both refunds must land: 30 000 + 20 000, not a last-write-wins 30 000",
    );
    pass("two refunds settling concurrently both land (no lost update)");
  }

  {
    // The ceiling must hold under the same concurrency: two refunds that together
    // exceed the capture cannot both be real, and the larger figure must not win.
    const { order, payment } = paidOrder({ amount: 100_000 });
    reset({ order, payment });
    state.onBeforePaymentUpdateMany = () => {
      // A competing refund consumes almost all the headroom first.
      payment.refundedAmount = 90_000;
    };
    const res = await webhook(
      refundEvent({ refundId: "rfnd_RACE2", amount: 30_000 }),
    );
    assert.equal(res.status, 200);
    state.onBeforePaymentUpdateMany = null;
    assert.equal(
      payment.refundedAmount,
      100_000,
      "refundedAmount is clamped to the capture and never exceeds it",
    );
    pass("a concurrent refund cannot push refundedAmount past the capture");
  }

  {
    // And the normal, uncontended path must be an INCREMENT rather than an
    // absolute write — that is the property the two tests above depend on.
    const { order, payment } = paidOrder();
    reset({ order, payment });
    await webhook(refundEvent({ refundId: "rfnd_INC", amount: 30_000 }));
    const inc = state.calls.find((c) => c.fn === "tx.payment.updateMany");
    assert.ok(inc, "the refund writes through updateMany");
    const data = inc.args["data"] as { refundedAmount?: { increment?: number } };
    assert.equal(
      data.refundedAmount?.increment,
      30_000,
      "the write is an increment, so it composes with any concurrent write",
    );
    assert.equal(
      inc.args["where"] === undefined,
      false,
      "and it is guarded, so it cannot overshoot the capture",
    );
    assert.equal(payment.refundedAmount, 30_000);
    pass("the refund write is a guarded atomic increment, not an absolute set");
  }

  // ── 3x. F9: verification must not revive a refunded payment ───────────────
  {
    // THE DEFECT. Both REFUNDED guards in /api/payments/verify test the ORDER's
    // status, which is a different question. An order can be PARTIALLY_PAID while
    // one of its individual payments is fully REFUNDED — a second capture was
    // taken, then the first was returned. A replayed verification for that returned
    // payment slipped past both guards and reached the upsert, whose update branch
    // hardcoded `status: "PAID"`.
    //
    // `refundedAmount` was not in that branch, so no balance moved. The ledger just
    // stopped describing what happened, and a payment labelled PAID is one a later
    // refund would match against as though it had never been returned.
    const refundedRow: PaymentRecord = {
      id: "pay_row_1",
      status: "REFUNDED",
      amount: 50_000,
      refundedAmount: 50_000,
      razorpayPaymentId: "pay_MAIN",
    };
    const orderRow: OrderRow = {
      ...ORDER,
      total: 100_000,
      paymentStatus: "PARTIALLY_PAID",
      payments: [refundedRow],
    };
    reset({ order: orderRow, payment: refundedRow });

    const res = await verify({
      orderId: "ord_1",
      razorpay_order_id: "order_ABC",
      razorpay_payment_id: "pay_MAIN",
      razorpay_signature: sign("pay_MAIN"),
    });
    assert.equal(res.status, 200);
    assert.equal(
      refundedRow.status,
      "REFUNDED",
      "a replayed verify must not flip a returned payment back to PAID",
    );
    assert.equal(
      refundedRow.refundedAmount,
      50_000,
      "and the returned figure is untouched",
    );
    assert.equal(
      state.writes.some((w) => w.model === "payment"),
      false,
      "no payment write at all",
    );
    assert.equal(
      state.writes.some((w) => w.model === "order"),
      false,
      "and the order is not re-settled on a payment that returned its money",
    );
    pass("verification cannot revive a REFUNDED payment on a PARTIALLY_PAID order");
  }

  {
    // The same guard must not block an ordinary replay of a payment that was NOT
    // refunded — that protection is Batch 3's and it has to survive.
    const plainRow: PaymentRecord = {
      id: "pay_row_1",
      status: "PAID",
      amount: 50_000,
      refundedAmount: 0,
      razorpayPaymentId: "pay_MAIN",
    };
    reset({
      order: { ...ORDER, total: 100_000, paymentStatus: "PARTIALLY_PAID", payments: [plainRow] },
      payment: plainRow,
    });
    const res = await verify({
      orderId: "ord_1",
      razorpay_order_id: "order_ABC",
      razorpay_payment_id: "pay_MAIN",
      razorpay_signature: sign("pay_MAIN"),
    });
    assert.equal(res.status, 200);
    assert.ok(
      state.writes.some((w) => w.model === "payment"),
      "an unrefunded payment is still recorded — the guard is refund-specific",
    );
    pass("the F9 guard does not weaken normal payment verification");
  }


  {
    // THE DEFECT THIS PASS OPENED. Switching the payment write from an absolute
    // set to an increment fixed concurrent DISTINCT refunds, but it removed the
    // accidental idempotency that made concurrent duplicates of the SAME refund
    // safe. Both deliveries read "no refund row" before either wrote, so both
    // planned a delta of 30 000; the ledger upsert serialised them on the unique
    // index, and then BOTH increments landed.
    //
    // A customer was refunded twice for one refund, and `Payment.refundedAmount`
    // — which drives the outstanding balance and the F6/F7 order closure — now
    // overstated what had come back by 30 000.
    //
    // Simulated by committing a full duplicate delivery in the window between this
    // transaction's read and its write of the ledger row.
    const { order, payment } = paidOrder();
    reset({ order, payment });

    let injected = false;
    state.onBeforeRefundLedgerWrite = () => {
      if (injected) return;
      injected = true;
      // The other delivery of rfnd_DUP completes first: row written, phase settled,
      // money returned.
      state.refunds.set("rfnd_DUP", {
        id: "re_other",
        status: "PROCESSED",
        amount: 30_000,
        paymentId: "pay_row_1",
      });
      payment.refundedAmount += 30_000;
    };

    const res = await webhook(refundEvent({ refundId: "rfnd_DUP", amount: 30_000 }));
    assert.equal(res.status, 200, "a concurrent duplicate is acknowledged, not 500");
    state.onBeforeRefundLedgerWrite = null;

    assert.equal(
      payment.refundedAmount,
      30_000,
      "one refund must move the money exactly once, even when two deliveries of "
        + "it overlap",
    );
    assert.equal(
      state.refunds.get("rfnd_DUP")?.status,
      "PROCESSED",
      "and the ledger keeps the settled phase",
    );
    assert.equal(
      state.refunds.size,
      1,
      "still exactly one Refund row for one refund",
    );
    pass("two overlapping deliveries of the same refund refund only once");
  }

  {
    // The companion guarantee: two refunds arriving together are still both
    // applied. A fix that made the duplicate safe by ignoring the second write
    // wholesale would pass the test above while silently dropping real refunds.
    const { order, payment } = paidOrder();
    reset({ order, payment });

    state.onBeforeRefundLedgerWrite = () => {
      // A different refund of the same capture settles in the same window.
      state.refunds.set("rfnd_OTHER", {
        id: "re_other",
        status: "PROCESSED",
        amount: 20_000,
        paymentId: "pay_row_1",
      });
      payment.refundedAmount += 20_000;
    };

    const res = await webhook(refundEvent({ refundId: "rfnd_MINE", amount: 30_000 }));
    assert.equal(res.status, 200);
    state.onBeforeRefundLedgerWrite = null;

    assert.equal(payment.refundedAmount, 50_000, "both distinct refunds land");
    assert.equal(state.refunds.size, 2, "and both are on the ledger");
    pass("an overlapping pair of distinct refunds are both applied");
  }


  {
    // The clamping path has its own race. When the guarded increment loses, the
    // route falls back to "add the room that is left" — but reading the room and
    // then adding it unguarded is the same lost-update shape one step later: a
    // competing refund can take that room in between, and an unguarded increment
    // would push refundedAmount past the capture.
    const { order, payment } = paidOrder({ amount: 100_000 });
    reset({ order, payment });

    let writes = 0;
    state.onBeforePaymentUpdateMany = () => {
      writes += 1;
      // 1st increment (the guarded one) loses: the capture is nearly spent.
      if (writes === 1) payment.refundedAmount = 90_000;
      // 2nd increment (the clamp fallback) also loses: the last of the room is
      // taken by yet another refund before this transaction can claim it.
      if (writes === 2) payment.refundedAmount = 100_000;
    };

    const res = await webhook(
      refundEvent({ refundId: "rfnd_CLAMP", amount: 30_000 }),
    );
    assert.equal(res.status, 200);
    state.onBeforePaymentUpdateMany = null;

    assert.equal(
      payment.refundedAmount,
      100_000,
      "the clamp fallback must re-check the ceiling under the row lock; an "
        + "unguarded increment overshoots it",
    );
    assert.ok(
      payment.refundedAmount <= payment.amount,
      "refundedAmount can never exceed the capture it came from",
    );
    pass("the clamp fallback is itself guarded against a concurrent claim");
  }


  {
    // THE RACE THE READ CANNOT COVER. The guard above reads the payment and then
    // writes. Under READ COMMITTED nothing serialises those two statements, so a
    // refund webhook settling in between was overwritten by the write's
    // unconditional `status: "PAID"`. The payment went back on the books as money
    // the customer had already handed back — and because the order was re-settled
    // from it, the returned amount stopped being deducted from the outstanding
    // balance. That is the duplicate collection the refund model exists to stop.
    const row: PaymentRecord = {
      id: "pay_row_1",
      status: "PAID",
      amount: 100_000,
      refundedAmount: 0,
      razorpayPaymentId: "pay_MAIN",
    };
    reset({ order: { ...ORDER, total: 100_000, payments: [row] }, payment: row });

    state.onBeforePaymentStatusWrite = () => {
      // The webhook's refund commits while this verify transaction is writing.
      row.status = "REFUNDED";
      row.refundedAmount = 100_000;
    };

    const res = await verify({
      orderId: "ord_1",
      razorpay_order_id: "order_ABC",
      razorpay_payment_id: "pay_MAIN",
      razorpay_signature: sign("pay_MAIN"),
    });
    assert.equal(res.status, 200, "a lost race is not an error to the browser");
    state.onBeforePaymentStatusWrite = null;

    assert.equal(
      row.status,
      "REFUNDED",
      "the write must refuse to move a REFUNDED payment back to PAID",
    );
    assert.equal(row.refundedAmount, 100_000, "and the returned figure stands");
    assert.equal(
      state.order?.paymentStatus,
      "PENDING",
      "the order is left for the refund webhook to settle — a verify that loses "
        + "the race must not settle it, or the returned amount stops counting "
        + "as returned and the balance becomes collectable again",
    );
    pass("verification loses the race to a refund instead of overwriting it");
  }

  console.log(`\nPASS all ${n} payment endpoint regression tests`);
})().catch((e: unknown) => {
  console.error("FAIL", e);
  process.exit(1);
});