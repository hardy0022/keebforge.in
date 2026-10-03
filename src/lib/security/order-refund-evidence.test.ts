import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";

/**
 * Regression coverage for the refund-evidence guard on the admin order delete.
 *
 * The defect is invisible in every other suite: `deleteOrder` is a server action,
 * so nothing exercises it. A test that only asserts "an order with refunds cannot
 * be deleted" would also pass against an implementation that simply threw for
 * every order, so the deletion path for un-refunded orders is pinned here too.
 *
 * The action's own module graph (prisma, auth, delhivery, next/*) is stubbed;
 * the pure payment modules it imports are the real ones.
 */

const REPO = path.resolve(__dirname, "../../..");
const ACTIONS_PATH = path.join(REPO, "src/app/admin/actions/orders.ts");

type DeleteCall = { op: string; args: Record<string, unknown> };

const state = {
  /** Row returned by the order lookup. */
  order: null as {
    orderNumber: string;
    _count: { refunds: number };
  } | null,
  /** Every write the action attempted, in order. */
  calls: [] as DeleteCall[],
  /** Number of permission checks — a guard that runs before authorization leaks. */
  permissionChecks: 0,
};

const prismaStub = {
  order: {
    findUnique: async (args: Record<string, unknown>) => {
      state.calls.push({ op: "order.findUnique", args });
      return state.order;
    },
    update: async (args: Record<string, unknown>) => {
      state.calls.push({ op: "order.update", args });
      return {};
    },
    delete: async (args: Record<string, unknown>) => {
      state.calls.push({ op: "order.delete", args });
      return {};
    },
  },
  orderTimeline: {
    create: async (args: Record<string, unknown>) => {
      state.calls.push({ op: "orderTimeline.create", args });
      return {};
    },
  },
};

const authStub = {
  requirePermission: async () => {
    state.permissionChecks += 1;
  },
};

const stubs: Record<string, unknown> = {
  "@/lib/db/prisma": { prisma: prismaStub },
  "@/lib/auth/admin": authStub,
  "next/cache": { revalidatePath: () => {} },
  "next/navigation": { redirect: () => {} },
  "@/lib/orders/tracking": { syncTrackingCache: async () => {} },
  "@/lib/shipping/delhivery": {
    bookPickup: async () => {},
    cancelShipment: async () => {},
    createShipment: async () => {},
    editShipment: async () => {},
    PICKUP_SETTING_KEY: "delhivery_pickup",
  },
  "@/lib/shipping/pickup-config": { resolvePickupLocation: async () => null },
};

const originalLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && stubs[request]) return stubs[request];
  return originalLoad.call(this, request, ...rest) as unknown;
};

void (async () => {
  const mod = (await import(ACTIONS_PATH)) as {
    deleteOrder: (prev: unknown, formData: FormData) => Promise<{ error?: string }>;
  };
  const { deleteOrder } = mod;

  let n = 0;
  const pass = (msg: string) => {
    n += 1;
    console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
  };

  // On success the action revalidates and calls `redirect()`, which in Next.js
  // throws and never returns — the stubbed no-op makes the promise resolve to
  // `undefined`. So an absent `error` is the success signal here.
  const call = async (orderId: unknown) => {
    state.calls = [];
    state.permissionChecks = 0;
    const fd = new FormData();
    if (orderId !== undefined) fd.set("orderId", orderId as string);
    return (await deleteOrder({}, fd)) ?? {};
  };

  // ── 1. F3: an order with refund rows must not be deletable ────────────────
  {
    // THE DEFECT. The delete was unconditional, and `Refund.orderId` is
    // ON DELETE CASCADE. Deleting an order therefore silently and permanently
    // destroyed every `rfnd_…` row belonging to it — the per-refund amount,
    // phase and Razorpay payment id that exist nowhere else. Razorpay's API can
    // re-derive the existence of a refund but not that local record, so the audit
    // trail for a financial transaction was being thrown away by an admin action
    // whose UI says only "delete".
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 1 } };
    const res = await call("ord_1");
    assert.ok(res.error, "the delete is refused");
    assert.equal(
      state.calls.some((c) => c.op === "order.delete"),
      false,
      "no DELETE is issued for an order holding refund records",
    );
    assert.equal(
      state.calls.some((c) => c.op === "order.update"),
      false,
      "and it is not archived in place either — that would silently change an "
        + "order's visibility instead of telling the admin the delete was refused",
    );
    assert.equal(state.permissionChecks, 1, "authorization still runs first");
    pass("an order with refund records cannot be deleted");
  }

  {
    // Several refunds: still refused, and the message has to say how many, because
    // the admin's next question is "how bad is this".
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 4 } };
    const res = await call("ord_1");
    assert.ok(res.error);
    assert.ok(
      /4/.test(res.error) && /refund/i.test(res.error),
      `the refusal should name the refund count, got: ${res.error}`,
    );
    assert.equal(state.calls.some((c) => c.op === "order.delete"), false);
    pass("the refusal reports how many refund records would be destroyed");
  }

  {
    // The guard must read the count from the database, not from anything cached
    // in the page: a missing `_count` select would make `undefined > 0` false and
    // re-open the hole.
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 1 } } as never;
    await call("ord_1");
    const lookup = state.calls.find((c) => c.op === "order.findUnique");
    assert.ok(lookup, "the order is read before deciding");
    const select = lookup?.args["select"] as { _count?: { select?: { refunds?: boolean } } };
    assert.equal(
      select._count?.select?.refunds,
      true,
      "the refund count must actually be selected — an unselected count is "
        + "undefined, and `undefined > 0` is false, which silently re-opens the bug",
    );
    pass("the guard reads a genuinely selected refund count");
  }

  // ── 2. The common case must keep working exactly as before ────────────────
  {
    // A guard that blocks everything would satisfy every test above. Tying an
    // order up still has to work: an admin cleaning up a duplicate or a test
    // order is the overwhelmingly common reason this action is used, and it must
    // not be collateral damage of the refund fix.
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 0 } };
    const res = await call("ord_1");
    assert.equal(res.error, undefined, `un-refunded orders still delete, got: ${res.error}`);
    assert.equal(
      state.calls.some((c) => c.op === "order.delete"),
      true,
      "the delete is actually issued",
    );
    pass("an order with no refund records is still deleted");
  }

  {
    // A missing order is a validation error, not a crash — and still no delete.
    state.order = null;
    const res = await call("ord_missing");
    assert.ok(res.error);
    assert.equal(state.calls.some((c) => c.op === "order.delete"), false);
    pass("an unknown order is refused without issuing a delete");
  }

  {
    // Missing/blank input must be rejected before any database work at all.
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 0 } };
    const blank = await call("");
    assert.ok(blank.error, "a blank orderId is invalid input");
    assert.equal(
      state.calls.length,
      0,
      "invalid input is rejected before touching the database",
    );
    pass("a blank order id is rejected without a database round trip");
  }

  console.log(`\nPASS all ${n} order refund evidence tests`);
})().catch((error: unknown) => {
  console.error("FAIL", error);
  process.exit(1);
});