import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ORDER_STATUS_LABELS } from "@/lib/orders";

/**
 * Rebuilds the PII-free Tracking cache row for an order. Called by every
 * admin/order mutation. The public /track/[orderNumber] page reads ONLY this
 * cache — never the raw order tables (no email/phone/address/notes leak).
 */
export async function syncTrackingCache(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      services: true,
      repairs: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      shipment: true,
      timeline: { orderBy: { createdAt: "asc" } },
      warranty: true,
    },
  });
  if (!order) return;

  const data: Prisma.TrackingUncheckedCreateInput = {
    orderId: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    status: order.status,
    paymentStatus: order.paymentStatus,
    total: order.total,
    items: order.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
    })),
    services: order.services.map((s) => ({
      name: s.name,
      quantity: s.quantity,
      unitPrice: s.unitPrice,
      lineTotal: s.lineTotal,
    })),
    repairs: order.repairs.map((r) => ({
      id: r.id,
      deviceType: r.deviceType,
      deviceModel: r.deviceModel,
      issue: r.issue,
      diagnosis: r.diagnosis,
    })),
    timeline: order.timeline.map((t) => ({
      status: t.status,
      label: ORDER_STATUS_LABELS[t.status],
      note: t.note,
      createdAt: t.createdAt,
    })),
    shipment: order.shipment
      ? {
          courier: order.shipment.courier,
          trackingNumber: order.shipment.trackingNumber,
          trackingUrl: order.shipment.trackingUrl,
          status: order.shipment.status,
          estimatedDispatchDate: order.shipment.estimatedDispatchDate,
          estimatedDeliveryDate: order.shipment.estimatedDeliveryDate,
          shippedAt: order.shipment.shippedAt,
          deliveredAt: order.shipment.deliveredAt,
        }
      : Prisma.JsonNull,
    warranty: order.warranty
      ? {
          status: order.warranty.status,
          startDate: order.warranty.startDate,
          endDate: order.warranty.endDate,
        }
      : Prisma.JsonNull,
    updatedAt: new Date(),
  };

  await prisma.tracking.upsert({ where: { orderId }, update: data, create: data });
}