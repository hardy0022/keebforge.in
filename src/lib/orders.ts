import { randomBytes } from "node:crypto";
import type { OrderStatus, ServiceUnit } from "@prisma/client";
import { formatINR, formatINRRange } from "@/lib/money";

/** Canonical human labels for the machine OrderStatus enum. Single source of truth. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  ORDER_RECEIVED: "Order Received",
  ORDER_CONFIRMED: "Order Confirmed",
  PAYMENT_PENDING: "Payment Pending",
  PAYMENT_RECEIVED: "Payment Received",
  PARTS_BOOKED: "Parts Booked",
  PARTS_SHIPPED: "Parts Shipped",
  PARTS_RECEIVED: "Parts Received",
  IN_QUEUE: "In Queue",
  WORK_STARTED: "Work Started",
  TESTING: "Testing",
  COMPLETED: "Completed",
  PACKING: "Packing",
  SHIPMENT_BOOKED: "Shipment Booked",
  SHIPMENT_PICKED_UP: "Shipment Picked Up",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  TESTING_WARRANTY_ACTIVE: "Testing Warranty Active",
  ORDER_COMPLETED: "Order Completed",
};

/** Progress stage per status (0–100), used by tracking UI. Single definition. */
export const ORDER_STATUS_STAGES: Record<OrderStatus, number> = {
  ORDER_RECEIVED: 5,
  ORDER_CONFIRMED: 10,
  PAYMENT_PENDING: 10,
  PAYMENT_RECEIVED: 20,
  PARTS_BOOKED: 25,
  PARTS_SHIPPED: 30,
  PARTS_RECEIVED: 35,
  IN_QUEUE: 40,
  WORK_STARTED: 50,
  TESTING: 65,
  COMPLETED: 75,
  PACKING: 80,
  SHIPMENT_BOOKED: 85,
  SHIPMENT_PICKED_UP: 88,
  IN_TRANSIT: 92,
  DELIVERED: 100,
  TESTING_WARRANTY_ACTIVE: 100,
  ORDER_COMPLETED: 100,
};

/** Badge color class (info/warning/success) per status. Single definition. */
export const ORDER_STATUS_CHIP: Record<OrderStatus, string> = {
  ORDER_RECEIVED: "status-info",
  ORDER_CONFIRMED: "status-info",
  PAYMENT_PENDING: "status-warning",
  PAYMENT_RECEIVED: "status-info",
  PARTS_BOOKED: "status-info",
  PARTS_SHIPPED: "status-info",
  PARTS_RECEIVED: "status-info",
  IN_QUEUE: "status-info",
  WORK_STARTED: "status-info",
  TESTING: "status-info",
  COMPLETED: "status-success",
  PACKING: "status-info",
  SHIPMENT_BOOKED: "status-info",
  SHIPMENT_PICKED_UP: "status-info",
  IN_TRANSIT: "status-info",
  DELIVERED: "status-success",
  TESTING_WARRANTY_ACTIVE: "status-success",
  ORDER_COMPLETED: "status-success",
};

export const SERVICE_UNIT_LABELS: Record<ServiceUnit, string> = {
  PER_SWITCH: "per switch",
  PER_STABILIZER: "per stabilizer",
  FLAT: "flat",
  QUOTE: "quote",
};

/** Server-side price text for a service, derived from the DB (never hardcoded). */
export function formatServicePriceText(s: {
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceLabel: string | null;
  unit: ServiceUnit;
} | null | undefined): string | null {
  if (!s) return null;
  if (s.priceLabel) return s.priceLabel;
  if (s.price != null) return `${formatINR(s.price)} ${SERVICE_UNIT_LABELS[s.unit]}`;
  if (s.priceMin != null && s.priceMax != null) return formatINRRange(s.priceMin, s.priceMax);
  return null;
}

/** KF + 6 alphanumeric characters, like the existing system. */
export function generateOrderNumber(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  const chars = randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[chars[i] % alphabet.length];
  return `KF${out}`;
}