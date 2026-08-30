"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS, ORDER_STATUS_STAGES } from "@/lib/orders";

/**
 * Reads the public-safe Tracking cache — never the raw Order tables (no
 * email/phone/address/notes leak). The cache is rebuilt on every admin/order
 * mutation via lib/tracking.syncTrackingCache.
 */
export type TrackTimelineEntry = { status: string; label: string; note: string | null; createdAt: string | null };
export type TrackLine = { name: string; quantity: number; unitPrice: number; lineTotal: number };
export type TrackRepairImage = { url: string; altText: string | null; sortOrder: number; role: string };
export type TrackRepair = { id: string; deviceType: string; deviceModel: string; issue: string; images: TrackRepairImage[] };
export type TrackShipment = {
  courier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  status: string | null;
  estimatedDispatchDate: string | null;
  estimatedDeliveryDate: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};
export type TrackData = {
  orderNumber: string;
  status: string;
  statusLabel: string;
  progress: number;
  paymentStatus: string;
  total: number;
  items: TrackLine[];
  services: TrackLine[];
  repairs: TrackRepair[];
  timeline: TrackTimelineEntry[];
  shipment: TrackShipment | null;
  updatedAt: string | null;
};

export type TrackState = { ok: true; data: TrackData } | { ok: false; error: string };

const orderNumberSchema = z
  .string()
  .trim()
  .transform((s) => s.replace(/[\s-]+/g, "").toUpperCase())
  .refine(
    (s) => /^[A-Z0-9]{4,20}$/.test(s),
    "That doesn't look like an order number — enter the number from your confirmation email (e.g. KF30X2A).",
  );

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function iso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  return typeof v === "string" && v ? new Date(v).toISOString() : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

export async function trackOrder(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const parsed = orderNumberSchema.safeParse(formData.get("orderNumber"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please enter a valid order number." };

  const row = await prisma.tracking.findUnique({ where: { orderNumber: parsed.data } });
  if (!row) {
    return {
      ok: false,
      error: `No order was found for "${parsed.data}". Double-check the number, or contact us and we'll look it up for you.`,
    };
  }

  const shipmentRaw = row.shipment == null ? null : asRecord(row.shipment);

  const repairsRaw = asArray(row.repairs);
  const repairRows = repairsRaw.map((rp) => asRecord(rp));
  const repairIds = repairRows.map((r) => str(r.id) ?? "").filter(Boolean);
  const repairMedia =
    repairIds.length > 0
      ? await prisma.media.findMany({ where: { entityType: "REPAIR", entityId: { in: repairIds } }, orderBy: { sortOrder: "asc" } })
      : [];

  return {
    ok: true,
    data: {
      orderNumber: row.orderNumber,
      status: row.status,
      statusLabel: ORDER_STATUS_LABELS[row.status] ?? row.status,
      progress: ORDER_STATUS_STAGES[row.status] ?? 0,
      paymentStatus: row.paymentStatus,
      total: row.total,
      items: asArray(row.items).map((it) => {
        const r = asRecord(it);
        return { name: str(r.name) ?? "Item", quantity: num(r.quantity), unitPrice: num(r.unitPrice), lineTotal: num(r.lineTotal) };
      }),
      services: asArray(row.services).map((s) => {
        const r = asRecord(s);
        return { name: str(r.name) ?? "Service", quantity: num(r.quantity), unitPrice: num(r.unitPrice), lineTotal: num(r.lineTotal) };
      }),
      repairs: repairRows.map((r) => ({
        id: str(r.id) ?? "",
        deviceType: str(r.deviceType) ?? "",
        deviceModel: str(r.deviceModel) ?? "",
        issue: str(r.issue) ?? "",
        images: repairMedia
          .filter((m) => m.entityId === r.id)
          .map((m) => ({ url: m.secureUrl, altText: m.altText, sortOrder: m.sortOrder, role: m.role })),
      })),
      timeline: asArray(row.timeline).map((t) => {
        const r = asRecord(t);
        return { status: str(r.status) ?? "", label: str(r.label) ?? "Update", note: str(r.note), createdAt: iso(r.createdAt) };
      }),
      shipment: shipmentRaw
        ? {
            courier: str(shipmentRaw.courier),
            trackingNumber: str(shipmentRaw.trackingNumber),
            trackingUrl: str(shipmentRaw.trackingUrl),
            status: str(shipmentRaw.status),
            estimatedDispatchDate: iso(shipmentRaw.estimatedDispatchDate),
            estimatedDeliveryDate: iso(shipmentRaw.estimatedDeliveryDate),
            shippedAt: iso(shipmentRaw.shippedAt),
            deliveredAt: iso(shipmentRaw.deliveredAt),
          }
        : null,
      updatedAt: iso(row.updatedAt),
    },
  };
}