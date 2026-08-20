"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { syncTrackingCache } from "@/lib/tracking";

export type ActionState = { ok?: boolean; error?: string };

const statusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum([
    "ORDER_RECEIVED", "ORDER_CONFIRMED", "PAYMENT_PENDING", "PAYMENT_RECEIVED",
    "PARTS_BOOKED", "PARTS_SHIPPED", "PARTS_RECEIVED", "IN_QUEUE",
    "WORK_STARTED", "TESTING", "COMPLETED", "PACKING", "SHIPMENT_BOOKED",
    "SHIPMENT_PICKED_UP", "IN_TRANSIT", "DELIVERED",
    "TESTING_WARRANTY_ACTIVE", "ORDER_COMPLETED",
  ]),
  note: z.string().max(2000).optional(),
});

export async function updateOrderStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = statusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: "Invalid status." };
  const { orderId, status, note } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, orderNumber: true } });
  if (!order) return { error: "Order not found." };

  await prisma.$transaction([
    prisma.order.update({ where: { id: orderId }, data: { status } }),
    prisma.orderTimeline.create({ data: { orderId, status, note: note ?? null } }),
  ]);
  await syncTrackingCache(orderId);
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true };
}

const timelineSchema = z.object({
  orderId: z.string().min(1),
  status: z.string().min(1).max(64),
  note: z.string().max(2000),
});

export async function addTimelineEntry(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = timelineSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    note: formData.get("note") || "",
  });
  if (!parsed.success) return { error: "Status and note are required." };
  const { orderId, status, note } = parsed.data;

  const enumVal = status as z.infer<typeof statusSchema>["status"];
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return { error: "Order not found." };

  await prisma.orderTimeline.create({ data: { orderId, status: enumVal, note: note || null } });
  await syncTrackingCache(orderId);
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true };
}

const shippingSchema = z.object({
  orderId: z.string().min(1),
  courier: z.string().max(120).optional(),
  trackingNumber: z.string().max(120).optional(),
  trackingUrl: z.string().url().max(500).optional().or(z.literal("")),
  status: z.enum(["NOT_DISPATCHED", "DISPATCHED", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "RETURNED"]).optional(),
});

export async function updateShipping(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = shippingSchema.safeParse({
    orderId: formData.get("orderId"),
    courier: formData.get("courier") || undefined,
    trackingNumber: formData.get("trackingNumber") || undefined,
    trackingUrl: formData.get("trackingUrl") || undefined,
    status: formData.get("status") || undefined,
  });
  if (!parsed.success) return { error: "Invalid shipping details." };
  const { orderId, ...data } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return { error: "Order not found." };

  await prisma.shipment.upsert({
    where: { orderId },
    update: data,
    create: { orderId, ...data },
  });
  await syncTrackingCache(orderId);
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true };
}

const notesSchema = z.object({
  orderId: z.string().min(1),
  message: z.string().max(4000),
  visibleToCustomer: z.string().optional(), // "1" when customer-visible
});

export async function addOrderNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const parsed = notesSchema.safeParse({
    orderId: formData.get("orderId"),
    message: formData.get("message") || "",
    visibleToCustomer: formData.get("visibleToCustomer") || undefined,
  });
  if (!parsed.success || !parsed.data.message.trim()) return { error: "Note cannot be empty." };
  const { orderId, message, visibleToCustomer } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return { error: "Order not found." };

  await prisma.orderMessage.create({
    data: {
      orderId,
      author: "ADMIN",
      message,
      visibleToCustomer: visibleToCustomer === "1",
    },
  });
  await syncTrackingCache(orderId);
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true };
}

export async function archiveOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !orderId) return { error: "Invalid order." };

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return { error: "Order not found." };

  await prisma.order.update({ where: { id: orderId }, data: { isDeleted: true } });
  await prisma.tracking.deleteMany({ where: { orderId } });
  revalidatePath("/admin/orders");
  return { ok: true };
}
