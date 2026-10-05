import "server-only";
import { Prisma } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";
import {
  EXCHANGE_EXPIRY_KEY,
  EXCHANGE_HASH_KEY,
  EXCHANGE_STATE_KEY,
  EXCHANGE_STATE_REDEEMABLE,
  EXCHANGE_STATE_REDEEMED,
} from "@/lib/payments/order-capability";

/**
 * Atomic partial updates for `Order.billingDetails`.
 *
 * The column is a single JSONB blob, so Prisma's `data: { billingDetails: x }`
 * REPLACES the whole document. Every writer therefore has to start from a
 * snapshot read earlier, and any write that lands in between gets silently
 * reverted — which for the payment flow means a redeemed exchange code coming
 * back to life, or a freshly minted capability disappearing.
 *
 * `jsonb_set` mutates one path in a single UPDATE, so these helpers touch only
 * the keys they own. Concurrent writers of *different* keys can no longer clobber
 * each other, and the exchange claim below carries its guard in the WHERE clause
 * so redemption is atomic without a read-modify-write at all.
 */

/** JSONB patch values. `null` removes the key; `undefined` leaves it alone. */
export type BillingPatch = Record<string, string | number | boolean | null>;

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Treats both SQL NULL and JSON `null` as "empty object". */
const BASE = Prisma.sql`COALESCE(NULLIF("billingDetails", 'null'::jsonb), '{}'::jsonb)`;

const PATH = (key: string) => Prisma.sql`ARRAY[${key}]::text[]`;

function assertKey(key: string) {
  if (!KEY_RE.test(key)) {
    throw new Error(`illegal billingDetails key: ${key}`);
  }
}

function applyPatch(
  expr: Prisma.Sql,
  patch: BillingPatch,
): Prisma.Sql {
  let out = expr;
  for (const [key, value] of Object.entries(patch)) {
    assertKey(key);
    if (value === undefined) continue;
    if (value === null) {
      out = Prisma.sql`(${out} - ${key})`;
    } else if (typeof value === "number") {
      out = Prisma.sql`jsonb_set(${out}, ${PATH(key)}, to_jsonb(${value}::double precision), true)`;
    } else if (typeof value === "boolean") {
      out = Prisma.sql`jsonb_set(${out}, ${PATH(key)}, to_jsonb(${value}::boolean), true)`;
    } else {
      out = Prisma.sql`jsonb_set(${out}, ${PATH(key)}, to_jsonb(${value}::text), true)`;
    }
  }
  return out;
}

/**
 * Write `patch` into an order's `billingDetails` without disturbing any other
 * key. Unlike replacing the document, this is safe to run concurrently with any
 * other writer: each statement reads the row's current JSONB and rewrites only
 * the paths it names.
 */
export async function patchBillingDetails(
  orderId: string,
  patch: BillingPatch,
): Promise<boolean> {
  if (Object.keys(patch).length === 0) return true;
  const rows = await prisma.$executeRaw(
    Prisma.sql`UPDATE "Order" SET "billingDetails" = ${applyPatch(BASE, patch)} WHERE "id" = ${orderId}`,
  );
  return rows === 1;
}

/**
 * Atomically redeem an exchange code: swap its hash for `newHash` and flip the
 * state to redeemed, but only while the row still holds the exact state this
 * code was issued in — state `redeemable`, the same hash we verified, and an
 * unexpired clock.
 *
 * One statement, so two simultaneous redemptions cannot both succeed (the loser's
 * WHERE clause no longer matches), and because only the exchange paths are
 * written, a concurrent `patchBillingDetails` of Razorpay fields cannot be lost.
 *
 * Returns false for unknown, expired, already-redeemed or mismatched codes.
 */
export async function claimExchangeRedemption(
  orderId: string,
  expectedCodeHash: string,
  newHash: string,
  now: number = Date.now(),
): Promise<boolean> {
  assertKey(EXCHANGE_HASH_KEY);
  const next = applyPatch(BASE, {
    [EXCHANGE_HASH_KEY]: newHash,
    [EXCHANGE_STATE_KEY]: EXCHANGE_STATE_REDEEMED,
    [EXCHANGE_EXPIRY_KEY]: null,
  });
  const rows = await prisma.$executeRaw(
    Prisma.sql`UPDATE "Order"
        SET "billingDetails" = ${next}
      WHERE "id" = ${orderId}
        AND "isDeleted" = false
        AND "billingDetails" ->> ${EXCHANGE_STATE_KEY} = ${EXCHANGE_STATE_REDEEMABLE}
        AND "billingDetails" ->> ${EXCHANGE_HASH_KEY} = ${expectedCodeHash}
        AND ("billingDetails" ->> ${EXCHANGE_EXPIRY_KEY})::bigint > ${now}`,
  );
  return rows === 1;
}