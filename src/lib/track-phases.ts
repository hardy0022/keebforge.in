import type { OrderStatus } from "@prisma/client";

/**
 * Customer-facing progress phases for the tracking stepper.
 * CLIENT-SAFE (no node imports) — keep separate from lib/orders.ts which pulls
 * in node:crypto. Every status below is a real OrderStatus enum value; the
 * mapping only groups existing statuses into display phases.
 */
export const ORDER_PHASE_LABELS = ["Placed", "In Workshop", "Quality Check", "Shipped", "Delivered"] as const;

export const ORDER_PHASE_INDEX: Record<OrderStatus, number> = {
  ORDER_RECEIVED: 0,
  ORDER_CONFIRMED: 0,
  PAYMENT_PENDING: 0,
  PAYMENT_RECEIVED: 0,
  PARTS_BOOKED: 0,
  PARTS_SHIPPED: 0,
  PARTS_RECEIVED: 0,
  IN_QUEUE: 0,
  WORK_STARTED: 1,
  TESTING: 1,
  COMPLETED: 2,
  PACKING: 2,
  SHIPMENT_BOOKED: 3,
  SHIPMENT_PICKED_UP: 3,
  IN_TRANSIT: 3,
  DELIVERED: 4,
  TESTING_WARRANTY_ACTIVE: 4,
  ORDER_COMPLETED: 4,
};

export function orderPhaseFor(status: OrderStatus): { index: number; label: string; total: number } {
  const index = ORDER_PHASE_INDEX[status] ?? 0;
  return { index, label: ORDER_PHASE_LABELS[index], total: ORDER_PHASE_LABELS.length };
}