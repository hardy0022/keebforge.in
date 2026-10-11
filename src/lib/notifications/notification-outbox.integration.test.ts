/**
 * Integration test for the paid-order notification migration
 * (20261010120000_order_paid_notifications) against a real, disposable
 * PostgreSQL.
 *
 * WHAT IT PROVES
 *
 *   The `(orderId, type)` unique index is the database-level guarantee behind
 *   "one confirmation row per order", and Prisma's `createMany { skipDuplicates }`
 *   compiles to `ON CONFLICT DO NOTHING` and therefore returns count 0 for a
 *   duplicate queue. The PENDING-only claim is likewise at-most-once. None of
 *   that can be checked against an in-memory fake, so this runs the migration
 *   SQL verbatim against a live server and exercises the real client.
 *
 * WHY IT IS SAFE
 *
 *   Every statement — the DDL, the synthetic orders and the notification rows —
 *   runs inside a single transaction that is always rolled back. Nothing is
 *   committed: the migration is applied to no persistent state, and any objects
 *   that already existed are restored by the rollback. The connection target is
 *   validated by `assertLocalEnvApplied` before the client is constructed, so a
 *   process whose URL came from `.env` (production) refuses before any query.
 *
 * RUN IT THROUGH THE RUNNER
 *
 *   npm run e2e:notification-outbox
 *
 *   Running this file directly by path refuses: the hoisted `@prisma/client`
 *   import loads `.env` first, so the environment is re-validated in-body and a
 *   production URL is rejected before a query is issued.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

import { assertLocalEnvApplied } from "../../../scripts/e2e/local-env";

/** Sentinel thrown to force the transaction to roll back on success. */
class Rollback extends Error {}

const MIGRATION = path.resolve(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "prisma/migrations/20261010120000_order_paid_notifications/migration.sql",
);

/** Strip line comments and split the migration into executable statements. */
function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

void (async () => {
  // Re-validate the live environment before constructing the client. The runner
  // pinned it; this refuses a production URL supplied any other way.
  assertLocalEnvApplied();
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

  let completed = false;
  try {
    await prisma.$transaction(
      async (tx) => {
        // Deterministic DDL regardless of any prior state. These drops (and every
        // write below) are part of the same transaction, so the rollback restores
        // whatever existed before.
        await tx.$executeRawUnsafe('DROP TABLE IF EXISTS "OrderNotification" CASCADE');
        await tx.$executeRawUnsafe('DROP TYPE IF EXISTS "NotificationType"');
        await tx.$executeRawUnsafe('DROP TYPE IF EXISTS "NotificationStatus"');

        for (const stmt of statements(readFileSync(MIGRATION, "utf8"))) {
          await tx.$executeRawUnsafe(stmt);
        }

        // ── The migration declares a UNIQUE (orderId, type) index ────────────
        const idx = (await tx.$queryRawUnsafe(
          `SELECT indexdef FROM pg_indexes WHERE indexname = 'OrderNotification_orderId_type_key'`,
        )) as Array<{ indexdef: string }>;
        assert.equal(idx.length, 1, "the (orderId, type) index must exist");
        assert.ok(/UNIQUE/i.test(idx[0]!.indexdef), "the index must be UNIQUE");
        const indexDef = idx[0]!.indexdef.replace(/"/g, "");
        assert.ok(
          indexDef.includes("orderId") && indexDef.includes("type"),
          "the unique index must cover (orderId, type)",
        );
        pass("the migration creates a UNIQUE (orderId, type) index");

        // ── The FK to Order cascades ────────────────────────────────────────
        const fk = (await tx.$queryRawUnsafe(
          `SELECT confdeltype FROM pg_constraint WHERE conname = 'OrderNotification_orderId_fkey'`,
        )) as Array<{ confdeltype: string }>;
        assert.equal(fk.length, 1, "the Order FK must exist");
        assert.equal(fk[0]!.confdeltype, "c", "the FK must cascade on delete");
        pass("the migration adds a cascade FK to Order");

        // ── Synthetic orders (rolled back) ──────────────────────────────────
        await tx.order.create({
          data: {
            id: "it_order_a",
            orderNumber: "IT-0001",
            type: "PRODUCT",
            customerName: "Integration A",
            customerEmail: "a@example.test",
          },
        });
        await tx.order.create({
          data: {
            id: "it_order_b",
            orderNumber: "IT-0002",
            type: "PRODUCT",
            customerName: "Integration B",
            customerEmail: "b@example.test",
          },
        });

        // ── Duplicate queueing is a no-op, exactly once ─────────────────────
        const first = await tx.orderNotification.createMany({
          data: [{ orderId: "it_order_a", type: "PAID_CONFIRMATION", updatedAt: new Date() }],
          skipDuplicates: true,
        });
        assert.equal(first.count, 1, "the first queue inserts one row");
        const duplicate = await tx.orderNotification.createMany({
          data: [{ orderId: "it_order_a", type: "PAID_CONFIRMATION", updatedAt: new Date() }],
          skipDuplicates: true,
        });
        assert.equal(duplicate.count, 0, "a duplicate queue inserts nothing");
        assert.equal(
          await tx.orderNotification.count({ where: { orderId: "it_order_a" } }),
          1,
          "exactly one row survives the duplicate queue",
        );
        pass("duplicate queueing under the unique constraint is a no-op");

        // ── Different orders are independent ────────────────────────────────
        const other = await tx.orderNotification.createMany({
          data: [{ orderId: "it_order_b", type: "PAID_CONFIRMATION", updatedAt: new Date() }],
          skipDuplicates: true,
        });
        assert.equal(other.count, 1, "a second order queues independently");
        assert.equal(await tx.orderNotification.count(), 2);
        pass("distinct orders get distinct confirmation rows");

        // ── The claim is PENDING-only and at-most-once ──────────────────────
        const claim1 = await tx.orderNotification.updateMany({
          where: { orderId: "it_order_a", status: "PENDING" },
          data: { status: "IN_PROGRESS", attempts: { increment: 1 } },
        });
        assert.equal(claim1.count, 1, "the first claim wins");
        const claim2 = await tx.orderNotification.updateMany({
          where: { orderId: "it_order_a", status: "PENDING" },
          data: { status: "IN_PROGRESS", attempts: { increment: 1 } },
        });
        assert.equal(claim2.count, 0, "a second claim cannot win");
        pass("the guarded PENDING claim is at-most-once");

        // ── Deleting the order cascades to its notification ─────────────────
        await tx.order.delete({ where: { id: "it_order_a" } });
        assert.equal(
          await tx.orderNotification.count({ where: { orderId: "it_order_a" } }),
          0,
          "deleting the order removes its notification",
        );
        pass("deleting an order cascades its notification rows");

        completed = true;
        throw new Rollback();
      },
      { timeout: 20000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) {
      console.error("FAIL", e);
      await prisma.$disconnect().catch(() => {});
      process.exit(1);
    }
  } finally {
    // Nothing was committed even on the rollback path; ensure the connection is
    // released before this process reports success.
    await prisma.$disconnect().catch(() => {});
  }

  if (!completed) {
    console.error("FAIL the migration assertions did not complete");
    process.exit(1);
  }
  console.log(`\nAll ${n} notification outbox integration checks passed (rolled back).`);
  process.exit(0);
})();
