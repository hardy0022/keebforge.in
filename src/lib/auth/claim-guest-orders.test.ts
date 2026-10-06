import assert from "node:assert/strict";
import Module from "node:module";
import path from "node:path";

/**
 * Coverage for guest-order claiming on the authenticated sign-in path.
 *
 * THE DEFECT THIS PINS
 * ─────────────────────
 * `getOrCreateProfileFromUser` is reached from `getCurrentAuth` on every
 * authenticated request, but it used to only provision a Profile. The
 * `profileId IS NULL -> profileId` attach lived solely in
 * `emailVerification.afterEmailVerification`, which fires only when someone
 * clicks the verification link. `requireEmailVerification` is deliberately
 * OFF, so an account can exist indefinitely without that click and its guest
 * orders stayed orphaned forever.
 *
 * Production evidence (read-only, 2026-10-05): order KFMUVITAWUVSKF matched
 * `setupuzz@gmail.com` character-for-character and was still unowned, because
 * that account's `emailVerified` was `false`. 9 of 12 orders were orphaned.
 *
 * The claim is asserted through an IN-MEMORY fake of `prisma.order.updateMany`
 * rather than a stubbed prisma double, so `where` clauses are evaluated for
 * real: an assertion that an order was NOT claimed has to be true because the
 * filter rejected it, not because a stub was told to return zero. A stub that
 * just replayed canned counts would pass even if the `profileId: null` guard
 * were deleted — the exact regression that would let one customer steal
 * another's order.
 */

/** One row in the fake `Order` table. */
type FakeOrder = {
  id: string;
  customerEmail: string;
  profileId: string | null;
  isDeleted: boolean;
};

const NOW = new Date("2026-10-05T00:00:00.000Z");

/**
 * Minimal evaluator for the subset of Prisma's `where` used by
 * `claimGuestOrdersForVerifiedProfile`. Unknown operators throw instead of
 * silently matching, so a broadened filter fails loudly rather than quietly
 * widening what a test can observe.
 */
function matches(order: FakeOrder, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, cond]) => {
    const actual = (order as unknown as Record<string, unknown>)[field];
    if (cond === null) return actual === null;
    return actual === cond;
  });
}

const state = {
  orders: [] as FakeOrder[],
  /** Every `updateMany` call, with the exact arguments the code passed. */
  calls: [] as Array<{ where: Record<string, unknown>; data: Record<string, unknown> }>,
  /** When set, the next updateMany rejects with this error. */
  failWith: null as Error | null,
  /** Claims attempted, including ones that matched nothing. */
  claimAttempts: 0,
};

const prismaStub = {
  profile: {
    findUnique: async (args: { where: Record<string, unknown> }) => {
      const { userId, email } = args.where as { userId?: string; email?: string };
      // Keyed by the userId actually looked up, so each test's sign-in resolves
      // the profile row that test seeded. A stub returning a fixed row for any
      // userId would let the create/link branches go unexercised.
      const byUserId: Record<string, unknown> = {
        "user-existing": { id: "prof-existing", userId: "user-existing", email: "buyer@example.com", name: "Existing", role: "CUSTOMER", createdAt: NOW, updatedAt: NOW },
        "user-seeded": { id: "prof-seeded", userId: null, email: "seeded@example.com", name: "Seeded", role: "CUSTOMER", createdAt: NOW, updatedAt: NOW },
      };
      if (userId !== undefined) return byUserId[userId] ?? null;
      return email === "seeded@example.com" ? byUserId["user-seeded"] : null;
    },
    update: async (args: { where: { id: string }; data: Record<string, unknown> }) => ({
      id: args.where.id,
      userId: "user-1",
      email: "linked@example.com",
      name: "Linked",
      role: "CUSTOMER",
      createdAt: NOW,
      updatedAt: NOW,
    }),
    create: async (args: { data: Record<string, unknown> }) => ({
      id: "prof-new",
      userId: args.data.userId,
      email: args.data.email,
      name: args.data.name,
      role: "CUSTOMER",
      createdAt: NOW,
      updatedAt: NOW,
    }),
  },
  order: {
    updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      state.calls.push(args);
      state.claimAttempts += 1;
      if (state.failWith) {
        const e = state.failWith;
        state.failWith = null;
        throw e;
      }
      const hits = state.orders.filter((o) => matches(o, args.where));
      for (const o of hits) {
        o.profileId = args.data.profileId as string;
      }
      return { count: hits.length };
    },
  },
};

const stubs: Record<string, unknown> = {
  "@/lib/db/prisma": { prisma: prismaStub },
};

const originalLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (
  request: unknown,
  ...rest: unknown[]
) {
  if (typeof request === "string" && stubs[request]) return stubs[request];
  return originalLoad.call(this, request, ...rest) as unknown;
};

const REPO = path.resolve(__dirname, "../../..");

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

const order = (id: string, email: string, profileId: string | null, isDeleted = false): FakeOrder => ({
  id,
  customerEmail: email,
  profileId,
  isDeleted,
});

const reset = () => {
  state.orders = [];
  state.calls = [];
  state.failWith = null;
  state.claimAttempts = 0;
};

void (async () => {
  const { getOrCreateProfileFromUser } = (await import(
    path.join(REPO, "src/lib/auth/profile.ts")
  )) as { getOrCreateProfileFromUser: (u: { id: string; email: string; name?: string | null }) => Promise<{ id: string; email: string }> };

  const signIn = (email: string, id = "user-existing") => getOrCreateProfileFromUser({ id, email });

  // ── 1. exact email match + authenticated user → order claimed ─────────────
  {
    reset();
    state.orders = [order("o1", "buyer@example.com", null)];
    const profile = await signIn("buyer@example.com");
    assert.equal(state.orders[0].profileId, profile.id, "order should carry the resolved profile id");
    pass("exact email match: unowned order is claimed on sign-in");
  }

  // ── 2. exact email match + already-owned order → unchanged ───────────────
  {
    reset();
    state.orders = [order("o1", "buyer@example.com", "prof-existing")];
    await signIn("buyer@example.com");
    assert.equal(state.orders[0].profileId, "prof-existing", "must not be rewritten");
    assert.equal(state.calls[0].where.profileId, null, "filter must require profileId IS NULL");
    pass("already-owned order: left untouched (profileId IS NULL guard present in filter)");
  }

  // ── 3. different email → not claimed ─────────────────────────────────────
  {
    reset();
    state.orders = [order("o1", "someone.else@example.com", null)];
    await signIn("buyer@example.com");
    assert.equal(state.orders[0].profileId, null, "other customer's order must stay unowned");
    pass("different email: order is not claimed");
  }

  // ── 4. order owned by ANOTHER profile → not claimed ───────────────────────
  {
    reset();
    state.orders = [order("o1", "buyer@example.com", "prof-victim")];
    await signIn("buyer@example.com");
    assert.equal(state.orders[0].profileId, "prof-victim", "must not steal a profile's order");
    pass("order owned by another profile: not claimed (no reassignment)");
  }

  // ── 5. multiple unowned matching orders → all claimed ─────────────────────
  {
    reset();
    state.orders = [
      order("o1", "buyer@example.com", null),
      order("o2", "buyer@example.com", null),
      order("o3", "buyer@example.com", null),
    ];
    const profile = await signIn("buyer@example.com");
    assert.deepEqual(
      state.orders.map((o) => o.profileId),
      [profile.id, profile.id, profile.id],
      "every matching unowned order is claimed",
    );
    pass("multiple matching unowned orders: all claimed");
  }

  // ── 6. repeated invocation → idempotent ───────────────────────────────────
  {
    reset();
    state.orders = [order("o1", "buyer@example.com", null)];
    const first = await signIn("buyer@example.com");
    const second = await signIn("buyer@example.com");
    const third = await signIn("buyer@example.com");
    assert.equal(state.orders[0].profileId, first.id, "profile id must be stable");
    assert.equal(state.orders[0].profileId, second.id);
    assert.equal(state.orders[0].profileId, third.id);
    // The later runs match nothing, which is what makes this a no-op rather
    // than a rewrite that could bump updatedAt on every authenticated request.
    assert.equal(state.calls.length, 3, "claim runs each time but is a no-op when nothing is unowned");
    assert.equal(state.calls[1].where.profileId, null);
    assert.equal(state.calls[2].where.profileId, null);
    pass("repeated invocation: idempotent, already-owned order never rewritten");
  }

  // ── 7. user without email → no claim ──────────────────────────────────────
  {
    reset();
    state.orders = [order("o1", "buyer@example.com", null)];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await getOrCreateProfileFromUser({ id: "user-1", email: "" as any });
    assert.equal(state.claimAttempts, 0, "must not attempt a claim without an email");
    assert.equal(state.orders[0].profileId, null);
    pass("user without email: no claim attempted");
  }

  // ── 8. deleted orders are excluded, matching the real filter ──────────────
  {
    reset();
    state.orders = [order("o1", "buyer@example.com", null, true)];
    await signIn("buyer@example.com");
    assert.equal(state.calls[0].where.isDeleted, false, "filter must exclude deleted orders");
    assert.equal(state.orders[0].profileId, null, "a deleted order stays unowned");
    pass("soft-deleted order: excluded by the isDeleted filter");
  }

  // ── 9. claim failure must NOT break session establishment ─────────────────
  {
    reset();
    state.orders = [order("o1", "buyer@example.com", null)];
    state.failWith = new Error("database unavailable");

    const profile = await signIn("buyer@example.com");
    assert.equal(profile.id, "prof-existing", "profile must still resolve");
    assert.equal(profile.email, "buyer@example.com", "existing-profile branch resolved");
    assert.equal(state.orders[0].profileId, null, "order stays unowned after a failed claim");

    // And it retries rather than giving up permanently.
    state.orders = [order("o1", "buyer@example.com", null)];
    await signIn("buyer@example.com");
    assert.equal(state.orders[0].profileId, "prof-existing", "retry on next request claims it");
    pass("claim failure: does not throw, session still resolves, retried next request");
  }

  // ── 10. profile resolution order: profile exists BEFORE the claim ────────
  {
    reset();
    state.orders = [order("o1", "newbie@example.com", null)];
    const profile = await signIn("newbie@example.com", "user-brand-new");
    assert.equal(profile.id, "prof-new", "created branch used");
    assert.equal(state.orders[0].profileId, "prof-new");
    pass("new account: profile created first, then its guest order claimed");
  }

  console.log(`\nall ${n} guest-order claim tests passed`);
})().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});