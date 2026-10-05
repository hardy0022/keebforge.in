import type { Prisma } from "@prisma/client";
import {
  derivePaymentStatus,
  orderStatusAfterCapture,
  settledAmount,
} from "@/lib/payments/payment-status";

/**
 * Settle an Order's payment state from CURRENT database rows, concurrency-safely.
 *
 * Both /api/payments/webhook (capture) and /api/payments/verify used to compute
 * `settledAfter` from a `settledAmount()` read taken BEFORE their settlement
 * transaction opened, then write the result back as an absolute `Order.paymentStatus`.
 * Under READ COMMITTED — which is what this app runs, since no `isolationLevel` is
 * set anywhere — nothing serialises that read against that write, so two captures
 * for two different payments on one order both read the same empty payment list,
 * both derive `PARTIALLY_PAID`, and the last write wins. The payment rows sum to the
 * full total while the order sits at PARTIALLY_PAID and, because neither plan saw
 * `fullyPaid`, `order.status` never advances to PAYMENT_RECEIVED — so a fully paid
 * order never enters fulfilment.
 *
 * The refund path was already hardened against exactly this class of bug (in-transaction
 * re-reads plus guarded increments, webhook route). This is the same discipline applied
 * to the capture side, and it lives here rather than inline in either route so the two
 * settlement paths cannot drift apart again.
 *
 * ── Why the row lock is the part that does the work ─────────────────────────────
 *
 * Merely re-reading inside the transaction is NOT sufficient: two transactions can
 * both re-read before either commits and reach the same wrong answer. The lock is what
 * closes the window — this takes an exclusive row lock on the Order and holds it to
 * commit, so a competing settlement cannot read until this one has finished.
 *
 * An earlier revision used a compare-and-swap on `paymentStatus`
 * (`UPDATE … WHERE id = ? AND paymentStatus = <value read inside this transaction>`)
 * as the serialisation mechanism. That was insufficient, and silently so:
 * `paymentStatus` is not a version token. Two captures can each commit a Payment row
 * while the order's `paymentStatus` stays `PARTIALLY_PAID` — as it must, when the sum
 * is still below the total — so the CAS predicate matches zero rows, no loser is
 * detected, and no retry runs. Both transactions derive `PARTIALLY_PAID` from their
 * own snapshot, both write it, and the order keeps a stale `PARTIALLY_PAID` while its
 * Payments sum to the full total. The bug survived a re-read that was correct in
 * isolation, because the re-read happened before the competing writer committed.
 *
 * The lock fixes the class rather than the symptom: it is taken on the ROW, not on a
 * column value, so it bites whenever two settlements overlap and is silent about the
 * values involved. The CAS predicate is retained, but demoted to what it now honestly
 * is — an assertion that the value the derivation was based on is still the value on
 * the row (the lock makes that a given, so it cannot be what admits the write).
 *
 * Every attempt is idempotent: it writes absolute values derived from rows read in
 * the same attempt, and the payment row itself was already claimed before this is
 * called. The loop is bounded, so a pathologically contended order cannot spin.
 *
 * ── Lock order ─────────────────────────────────────────────────────────────────
 *
 * Every transaction in this codebase acquires Payment before Order:
 *
 *   webhook capture   payment.createMany/updateMany  →  settleOrderInTransaction
 *   verify            payment.createMany/updateMany  →  settleOrderInTransaction
 *   webhook fail      payment.upsert                 →  order.update
 *   webhook refund    refund.*  →  payment.updateMany →  order.update
 *
 * Both callers of this helper reach it only AFTER their Payment write, so the Order
 * lock is appended at the end of that chain — no path acquires anything after it. The
 * helper itself takes no Payment lock: it only READS payment rows after the lock, and
 * writes the Order row it already holds. A shared-order cycle would require two
 * transactions taking Payment and Order in opposite orders, and none exists.
 */

/** Why the settlement write did not land. */
export type SettleOutcome =
  | {
      kind: "SETTLED";
      /** `Order.paymentStatus` now committed. */
      paymentStatus: string;
      /** `Order.status` now committed. */
      orderStatus: string;
      /** How many attempts it took. 1 unless the write did not land. */
      attempts: number;
    }
  | {
      kind: "LOST";
      /**
       * Nothing was written by this call — the order was not there, or the write did
       * not match. Under the lock this should not happen for a live order; it is kept
       * so a caller never silently assumes the order was settled when it was not.
       */
      attempts: number;
    };

/** Reads one order and the payment rows that decide its money state. */
const ORDER_SELECT = {
  id: true,
  total: true,
  status: true,
  paymentStatus: true,
  payments: { select: { status: true, amount: true, razorpayPaymentId: true } },
} as const;

/**
 * Bounded because each retry means the previous attempt's conditional write did not
 * land at all — not ordinary contention, which the Order lock resolves by waiting
 * rather than by failing. Three is far more than that needs: it exists so a lost
 * write cannot masquerade as a settled order.
 */
const MAX_ATTEMPTS = 3;

/**
 * Serialise competing settlements on the Order row, before any Payment row that feeds
 * the settlement is read.
 *
 * `FOR NO KEY UPDATE`, and the distinction from `FOR UPDATE` is load-bearing rather
 * than stylistic. Both exclude other settlers — that is the requirement, and it holds
 * for the ROW rather than for a column value, so it is unaffected by `paymentStatus`
 * not changing between two overlapping settlements.
 *
 * They differ against the lock Postgres takes implicitly on this same Order row when
 * any transaction INSERTS a Payment referencing it: the foreign-key check takes
 * `FOR KEY SHARE` on the parent row, held until that transaction commits. A capture
 * does exactly that — `payment.createMany` at the top of its own transaction — so
 * with plain `FOR UPDATE` two concurrent captures of one order would each hold a KEY
 * SHARE from their own insert and then each wait for the other's to release before
 * upgrading to `FOR UPDATE`. Neither can release until it commits and neither can
 * commit until it gets the lock: a genuine deadlock, which Postgres resolves by
 * aborting one transaction after `deadlock_timeout` — a 500 on a webhook the gateway
 * would retry, and a 500 in the customer's face on verify.
 *
 * `FOR NO KEY UPDATE` does not conflict with `FOR KEY SHARE`, so those inserts
 * proceed unimpeded and the two upgrades simply queue behind each other. It is also
 * exactly the strength Postgres already takes for the plain
 * `UPDATE "Order" SET status, paymentStatus` that follows, so the lock is not taken
 * more strongly than the write needs.
 *
 * Both identifiers are quoted: the provider is PostgreSQL and the model has no
 * `@@map`, so the physical table is the reserved word `Order` and the column is
 * `id`. `FOR UPDATE` locks rows that fail to match a `WHERE` clause, so the id is
 * bound as a parameter rather than interpolated. `FOR NO KEY UPDATE` locks only
 * matching rows, which is what the `!order` check in the caller is for.
 */
async function lockOrderForSettlement(
  tx: Prisma.TransactionClient,
  orderId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR NO KEY UPDATE`;
}

export async function settleOrderInTransaction(
  tx: Prisma.TransactionClient,
  args: {
    orderId: string;
    /**
     * Paise this capture is worth. Added to the settled sum of the order's OTHER
     * payments, so the result is the same whether or not this payment row already
     * existed — which is what makes a redelivered capture idempotent rather than
     * self-double-counting.
     */
    amount: number;
    /** Excluded from the settled sum; see {@link args.amount}. */
    razorpayPaymentId: string | null;
  },
): Promise<SettleOutcome> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    // Before the read, and held to commit. A competing settlement either committed
    // already — in which case its Payment row is visible to the read below — or it is
    // still waiting here and will read the world this attempt writes.
    await lockOrderForSettlement(tx, args.orderId);

    const order = await tx.order.findUnique({
      where: { id: args.orderId },
      select: ORDER_SELECT,
    });
    if (!order) return { kind: "LOST", attempts: attempt };

    // Every figure below comes from rows read in THIS attempt, inside the
    // transaction — never from a read taken before it opened.
    const settledAfter =
      settledAmount(
        order.payments.filter(
          (p) => p.razorpayPaymentId !== args.razorpayPaymentId,
        ),
      ) + args.amount;

    const paymentStatus = derivePaymentStatus(
      settledAfter,
      order.total,
      order.paymentStatus,
    );
    const orderStatus = orderStatusAfterCapture(
      order.status,
      order.total > 0 && settledAfter >= order.total,
    );

    const written = await tx.order.updateMany({
      where: {
        id: order.id,
        // Not the concurrency mechanism — the lock above is. This only asserts the
        // value the derivation was based on is still the value on the row. It cannot
        // detect a competing settlement, which is precisely why it is not relied on:
        // `paymentStatus` is frequently unchanged by a competing capture.
        paymentStatus: order.paymentStatus,
      },
      data: { paymentStatus, status: orderStatus },
    });

    if (written.count === 1) {
      return { kind: "SETTLED", paymentStatus, orderStatus, attempts: attempt };
    }
  }

  return { kind: "LOST", attempts: MAX_ATTEMPTS };
}