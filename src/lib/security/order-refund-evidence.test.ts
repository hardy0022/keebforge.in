import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";
import type { Role } from "@prisma/client";
import { canAction } from "@/lib/auth/roles";

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
 *
 * ── On the authorization stub ────────────────────────────────────────────────
 *
 * This suite originally stubbed `requirePermission` as `async () => { count++ }` —
 * always successful, asserting only that it was *called*. That cannot establish the
 * role/action boundary for two reasons, both of which are now closed:
 *
 *   1. An always-successful stub cannot observe a DENIAL, so the suite passed
 *      unchanged if the `requirePermission("order", "delete")` line were deleted
 *      outright. A test that cannot fail when the guard is removed proves nothing.
 *   2. It never consulted the permission matrix, so `canAction` — where the actual
 *      role policy lives — was never executed by anything.
 *
 * So the stub now delegates to the REAL `canAction` (imported above; `roles.ts` is
 * deliberately NOT stubbed) against a configurable role, and DENIAL THROWS the way
 * `next/navigation`'s `redirect()` throws. That throw is load-bearing: `requirePermission`
 * denies by redirecting, and in Next.js `redirect()` never returns. A stub that
 * merely returned would let a denied request fall straight through into
 * `prisma.order.delete` — exactly the outcome these tests must rule out.
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
  /**
   * The permission checks the action asked for, in order. Recording the ARGUMENTS —
   * not merely counting invocations — is what pins the resource/action pair, so a
   * refactor that weakened `order:delete` to `order:update` (which STAFF and
   * DEVELOPER both hold) would fail here instead of silently widening access.
   */
  permissionChecks: [] as Array<{ resource: string; action: string }>,
  /** The role the REAL `canAction` matrix is evaluated against. */
  role: "ADMIN" as Role,
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

/**
 * Mirrors `src/lib/auth/admin.ts:requirePermission`, and denies by THROWING.
 *
 * `requirePermission` is `requireAdminContext()` + `canAction()` + `redirect()`. The
 * admin-context half (session lookup) is not what is under test, so it is elided; the
 * `canAction` half — the actual role policy — is the real implementation, and the
 * `redirect()` half is reproduced faithfully by throwing.
 */
const authStub = {
  requirePermission: async (resource: string, action: string) => {
    state.permissionChecks.push({ resource, action });
    if (canAction(state.role, resource, action)) return;
    // next/navigation's redirect() throws a NEXT_REDIRECT error that unwinds the
    // action; it does not return. Reproducing that is what makes a denied call
    // provably unable to continue into the database mutation.
    throw Object.assign(new Error("NEXT_REDIRECT"), {
      digest: `NEXT_REDIRECT;replace;/unauthorized;${resource}:${action}`,
    });
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
  //
  // A denial also throws, and that is NOT an ActionState error: it is Next.js
  // unwinding. `call` therefore separates the two, so a test can assert "refused
  // with a message" and "refused by authorization" without conflating them.
  const call = async (orderId: unknown) => {
    state.calls = [];
    state.permissionChecks = [];
    const fd = new FormData();
    if (orderId !== undefined) fd.set("orderId", orderId as string);
    try {
      return {
        denied: false as const,
        result: ((await deleteOrder({}, fd)) ?? {}) as { error?: string },
      };
    } catch (e) {
      const digest = (e as { digest?: string }).digest;
      if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
        return { denied: true as const, result: {} as { error?: string } };
      }
      throw e;
    }
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
    const { result: res } = await call("ord_1");
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
    assert.deepEqual(
      state.permissionChecks,
      [{ resource: "order", action: "delete" }],
      "authorization still runs first, and asks for order:delete specifically — a "
        + "weakened action pair would widen access to STAFF and DEVELOPER, who both "
        + "hold order:update",
    );
    pass("an order with refund records cannot be deleted");
  }

  {
    // Several refunds: still refused, and the message has to say how many, because
    // the admin's next question is "how bad is this".
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 4 } };
    const { result: res } = await call("ord_1");
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
    const { result: res } = await call("ord_1");
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
    const { result: res } = await call("ord_missing");
    assert.ok(res.error);
    assert.equal(state.calls.some((c) => c.op === "order.delete"), false);
    pass("an unknown order is refused without issuing a delete");
  }

  {
    // Missing/blank input must be rejected before any database work at all.
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 0 } };
    const { result: blank } = await call("");
    assert.ok(blank.error, "a blank orderId is invalid input");
    assert.equal(
      state.calls.length,
      0,
      "invalid input is rejected before touching the database",
    );
    pass("a blank order id is rejected without a database round trip");
  }

  // ── 3. The role boundary ──────────────────────────────────────────────────
  //
  // The refund-evidence tests above all run as ADMIN and prove nothing about WHO may
  // delete. These do, by driving the same action through the real `canAction` matrix.
  {
    // ADMIN is the wildcard, so it reaches the mutation. Positive control for the
    // block below: without it, a `canAction` broken to always return false would
    // make every denial test pass while making the action unusable.
    state.role = "ADMIN";
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 0 } };
    const { denied, result: res } = await call("ord_1");
    assert.equal(denied, false, "ADMIN is authorized and is not redirected");
    assert.equal(res.error, undefined);
    assert.equal(
      state.calls.some((c) => c.op === "order.delete"),
      true,
      "ADMIN actually deletes an eligible order",
    );
    pass("ADMIN can delete an eligible order");
  }

  // The three roles the matrix denies. Each is asserted on the same eligible order
  // ADMIN just deleted, so the only variable is the role.
  for (const role of ["STAFF", "DEVELOPER", "CUSTOMER"] as const) {
    state.role = role;
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 0 } };
    const { denied } = await call("ord_1");

    assert.equal(
      denied,
      true,
      `${role} must be denied — the matrix grants order:[view, update] and no delete`,
    );
    assert.deepEqual(
      state.permissionChecks,
      [{ resource: "order", action: "delete" }],
      `${role} must still be asked for order:delete, so the denial is a policy `
        + "decision rather than an unrelated crash",
    );
    // The load-bearing assertion. `requirePermission` runs before the lookup, so a
    // denial must unwind BEFORE any database work — in particular before the DELETE.
    assert.equal(
      state.calls.length,
      0,
      `${role} must not reach the database at all: authorization is the first `
        + "statement in the action, so nothing should have been read or written",
    );
    assert.equal(
      state.calls.some((c) => c.op === "order.delete"),
      false,
      `${role} must never issue prisma.order.delete`,
    );
    pass(`${role} cannot delete an order`);
  }

  {
    // Denying an order WITHOUT refund evidence is the case that matters: the
    // refund guard returns an ActionState error, so an implementation that relied
    // on it as its access control would appear to "refuse" a non-ADMIN delete while
    // actually deleting anything that has no refunds. This pins that the refusal is
    // authorization, not the refund guard.
    state.role = "STAFF";
    state.order = { orderNumber: "KFTEST0001", _count: { refunds: 0 } };
    const { denied, result: res } = await call("ord_1");
    assert.equal(denied, true, "refused by authorization");
    assert.equal(
      res.error,
      undefined,
      "a denial is a redirect, not an ActionState message — so the admin never sees "
        + "the refund-evidence copy and cannot mistake it for a refund problem",
    );
    assert.equal(state.calls.length, 0);
    pass("a denied delete is refused by authorization, not by the refund guard");
  }

  {
    // DEVELOPER is denied for the same reason as STAFF, but that is a POLICY choice
    // (the matrix gives staff and developers identical order permissions). Pin it so
    // a future change that grants developers order:delete has to update this test
    // consciously rather than silently widening destructive access.
    assert.equal(
      canAction("DEVELOPER", "order", "delete"),
      false,
      "DEVELOPER currently has no order:delete — update this test if that changes",
    );
    assert.equal(
      canAction("STAFF", "order", "update"),
      true,
      "STAFF can update orders, which is why an order:delete check is a meaningful "
        + "distinction here and not a blanket block",
    );
    assert.equal(canAction("ADMIN", "order", "delete"), true);
    assert.equal(canAction("CUSTOMER", "order", "view"), false, "CUSTOMER has no admin access at all");
    pass("the order:delete matrix is pinned: ADMIN only");
  }

  state.role = "ADMIN";
  console.log(`\nPASS all ${n} order refund evidence tests`);
})().catch((error: unknown) => {
  console.error("FAIL", error);
  process.exit(1);
});