import type { OrderStatus } from "@prisma/client";

/** Statuses treated as a finished/completed order. */
export const COMPLETED_STATUSES: OrderStatus[] = [
  "DELIVERED",
  "ORDER_COMPLETED",
];

export type AdminOrderStatusFilterInput = {
  status?: OrderStatus;
  completed?: boolean;
  excludeCompleted?: boolean;
};

type OrderStatusFilter =
  | OrderStatus
  | { in: OrderStatus[] }
  | { notIn: OrderStatus[] };

type OrderStatusWhere = { status?: OrderStatusFilter };

/**
 * Status filter for the admin order list.
 *
 * An explicitly selected status always wins. The orders list defaults to
 * `excludeCompleted: true`, so without this precedence that default silently
 * replaced every status chosen in the filter. The no-status cases keep the
 * existing list semantics: completed-only, hide-completed, or everything.
 */
export function adminOrderStatusFilter({
  status,
  completed,
  excludeCompleted,
}: AdminOrderStatusFilterInput): OrderStatusWhere {
  if (status) return { status };
  if (completed) return { status: { in: COMPLETED_STATUSES } };
  if (excludeCompleted) return { status: { notIn: COMPLETED_STATUSES } };
  return {};
}
