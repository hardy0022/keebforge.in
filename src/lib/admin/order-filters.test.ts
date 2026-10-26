import assert from "node:assert/strict";
import {
  adminOrderStatusFilter,
  COMPLETED_STATUSES,
} from "@/lib/admin/order-filters";

/**
 * Admin order status filter.
 *
 * The orders page passes `excludeCompleted: true` by default. Before this
 * helper, that default was evaluated first and replaced every status chosen in
 * the filter, so the status dropdown did nothing. These cases pin the
 * precedence: an explicit status wins, and the two completed-list modes still
 * work when no status is selected.
 *
 * Offline: no database, no network.
 *
 * Run: npx tsx src/lib/admin/order-filters.test.ts
 */

let n = 0;
const pass = (msg: string) => {
  n += 1;
  console.log(`PASS ${String(n).padStart(2, "0")} ${msg}`);
};

// ── Explicit status wins over the list default ──────────────────────────────

assert.deepEqual(
  adminOrderStatusFilter({
    status: "PAYMENT_PENDING",
    excludeCompleted: true,
  }),
  { status: "PAYMENT_PENDING" },
  "the orders page default must not replace a selected status",
);
pass("explicit status wins over excludeCompleted");

assert.deepEqual(
  adminOrderStatusFilter({
    status: "WORK_STARTED",
    completed: true,
  }),
  { status: "WORK_STARTED" },
  "a selected status is not silently rewritten to the completed set",
);
pass("explicit status wins over the completed-only mode");

// ── Default list semantics are unchanged ────────────────────────────────────

assert.deepEqual(
  adminOrderStatusFilter({ excludeCompleted: true }),
  { status: { notIn: COMPLETED_STATUSES } },
);
pass("the default list still hides completed orders");

assert.deepEqual(
  adminOrderStatusFilter({ completed: true }),
  { status: { in: COMPLETED_STATUSES } },
);
pass("the completed page still shows only completed statuses");

assert.deepEqual(adminOrderStatusFilter({}), {});
pass("a list with no status and no completed switch is unfiltered");

// ── Completed statuses cannot be selected by accident ───────────────────────

assert.deepEqual(adminOrderStatusFilter({ status: "DELIVERED" }), {
  status: "DELIVERED",
});
assert.deepEqual(adminOrderStatusFilter({ status: "ORDER_COMPLETED" }), {
  status: "ORDER_COMPLETED",
});
pass("completed statuses can still be selected explicitly");

console.log(`\nPASS all ${n} admin order filter tests`);
