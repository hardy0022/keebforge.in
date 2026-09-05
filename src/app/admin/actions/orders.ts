"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";
import { syncTrackingCache } from "@/lib/tracking";
import { createShipment, PICKUP_SETTING_KEY, type CreateShipmentInput, type PickupLocation } from "@/lib/delhivery";

export type ActionState = { ok?: boolean; error?: string; message?: string };

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

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
  await requirePermission("order", "update");
  const parsed = statusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: "Invalid status." };
  const { orderId, status, note } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true, orderNumber: true } });
  if (!order) return { error: "Order not found." };

  try {
    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { status } }),
      prisma.orderTimeline.create({ data: { orderId, status, note: note ?? null } }),
    ]);
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("updateOrderStatus failed:", e);
    return { error: "Couldn't save status change." };
  }
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
  await requirePermission("order", "update");
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

  try {
    await prisma.orderTimeline.create({ data: { orderId, status: enumVal, note: note || null } });
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("addTimelineEntry failed:", e);
    return { error: "Couldn't add timeline entry." };
  }
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
  await requirePermission("order", "update");
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

  try {
    await prisma.shipment.upsert({
      where: { orderId },
      update: data,
      create: { orderId, ...data },
    });
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("updateShipping failed:", e);
    return { error: "Couldn't save shipping details." };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true };
}

const notesSchema = z.object({
  orderId: z.string().min(1),
  message: z.string().max(4000),
  visibleToCustomer: z.string().optional(), // "1" when customer-visible
});

export async function addOrderNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = notesSchema.safeParse({
    orderId: formData.get("orderId"),
    message: formData.get("message") || "",
    visibleToCustomer: formData.get("visibleToCustomer") || undefined,
  });
  if (!parsed.success || !parsed.data.message.trim()) return { error: "Note cannot be empty." };
  const { orderId, message, visibleToCustomer } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return { error: "Order not found." };

  try {
    await prisma.orderMessage.create({
      data: {
        orderId,
        author: "ADMIN",
        message,
        visibleToCustomer: visibleToCustomer === "1",
      },
    });
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("addOrderNote failed:", e);
    return { error: "Couldn't save note." };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true };
}

const amountsSchema = z.object({
  orderId: z.string().min(1),
  subtotal: z.coerce.number().int().min(0),
  shipping: z.coerce.number().int().min(0),
  discount: z.coerce.number().int().min(0),
  total: z.coerce.number().int().min(0),
});

/** Derive paymentStatus from the sum of captured (PAID) payments vs total. */
function paymentStatusFor(paid: number, total: number): "PAID" | "PARTIALLY_PAID" | "PENDING" {
  if (total > 0 && paid >= total) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  return "PENDING";
}

export async function updateOrderAmounts(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = amountsSchema.safeParse({
    orderId: formData.get("orderId"),
    subtotal: formData.get("subtotal"),
    shipping: formData.get("shipping"),
    discount: formData.get("discount"),
    total: formData.get("total"),
  });
  if (!parsed.success) return { error: "Invalid amounts." };
  const { orderId, subtotal, shipping, discount, total } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true, payments: { where: { status: "PAID" }, select: { amount: true } } },
  });
  if (!order) return { error: "Order not found." };

  const paid = order.payments.reduce((s, p) => s + p.amount, 0);
  const paymentStatus = paymentStatusFor(paid, total);

  try {
    await prisma.$transaction([
      prisma.order.update({
        where: { id: orderId },
        data: { subtotal, shipping, discount, total, paymentStatus },
      }),
      prisma.orderTimeline.create({
        data: { orderId, status: "PAYMENT_PENDING",         note: `Amounts updated by admin (subtotal ₹${rupees(subtotal)}, shipping ₹${rupees(shipping)}, discount ₹${rupees(discount)}, total ₹${rupees(total)}).` },
      }),
    ]);
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("updateOrderAmounts failed:", e);
    return { error: "Couldn't save amounts." };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true };
}

const addressSchema = z.object({
  orderId: z.string().min(1),
  label: z.string().max(80).optional().or(z.literal("")),
  streetAddress: z.string().min(1).max(300),
  apartment: z.string().max(120).optional().or(z.literal("")),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(120),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(1).max(80),
  phone: z.string().max(30).optional().or(z.literal("")),
});

export async function updateOrderAddress(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = addressSchema.safeParse({
    orderId: formData.get("orderId"),
    label: formData.get("label") || undefined,
    streetAddress: formData.get("streetAddress"),
    apartment: formData.get("apartment") || undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode"),
    country: formData.get("country"),
    phone: formData.get("phone") || undefined,
  });
  if (!parsed.success) return { error: "Invalid address details." };
  const { orderId, label, streetAddress, apartment, city, state, postalCode, country, phone } = parsed.data;

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return { error: "Order not found." };

  try {
    await prisma.orderAddress.upsert({
      where: { orderId },
      update: {
        label: label || null,
        streetAddress,
        apartment: apartment || null,
        city,
        state,
        postalCode,
        country,
        phone: phone || null,
      },
      create: {
        orderId,
        label: label || null,
        streetAddress,
        apartment: apartment || null,
        city,
        state,
        postalCode,
        country,
        phone: phone || null,
      },
    });
  } catch (e) {
    console.error("updateOrderAddress failed:", e);
    return { error: "Couldn't save address." };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true };
}

const createShipmentSchema = z.object({
  orderId: z.string().min(1),
  weightGrams: z.coerce.number().int().min(1).optional(),
  widthCm: z.coerce.number().int().min(1).optional(),
  heightCm: z.coerce.number().int().min(1).optional(),
  lengthCm: z.coerce.number().int().min(1).optional(),
  declaredValue: z.coerce.number().int().min(1).optional(),
});

/**
 * One-click Delhivery manifest: builds the cmu payload from the order's
 * saved address + totals, calls Delhivery, then stores the returned waybill
 * as the shipment tracking number and marks it dispatched.
 */
export async function createShipmentDelivery(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = createShipmentSchema.safeParse({
    orderId: formData.get("orderId"),
    weightGrams: formData.get("weightGrams") || undefined,
    widthCm: formData.get("widthCm") || undefined,
    heightCm: formData.get("heightCm") || undefined,
    lengthCm: formData.get("lengthCm") || undefined,
    declaredValue: formData.get("declaredValue") || undefined,
  });
  if (!parsed.success) return { error: "Check the shipment fields (dimensions must be ≥ 1 cm)." };
  const { orderId, weightGrams: enteredWeight, widthCm, heightCm, lengthCm, declaredValue } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      shippingAddress: true,
      items: { select: { name: true, quantity: true } },
      services: { select: { name: true, quantity: true } },
      repairs: { select: { deviceType: true, deviceModel: true, issue: true, quotePrice: true } },
      shipment: { select: { trackingNumber: true } },
    },
  });
  if (!order) return { error: "Order not found." };
  if (order.shipment?.trackingNumber) {
    return { error: `This order is already dispatched (waybill ${order.shipment.trackingNumber}).` };
  }
  const addr = order.shippingAddress;
  if (!addr) return { error: "Add a shipping address to this order first." };

  const weightGrams = enteredWeight ?? order.shippingWeightGrams;
  if (!weightGrams || weightGrams < 1) return { error: "A shipment weight (grams) is required." };

  // Pickup location from the admin Settings card (PICKUP_SETTING_KEY), falling
  // back to DELHIVERY_PICKUP_* env vars, then DELHIVERY_ORIGIN_PINCODE. The
  // return fields default to the same warehouse so RTO packages have an address.
  const pickupSetting = await prisma.siteSetting.findUnique({ where: { key: PICKUP_SETTING_KEY } });
  const ps =
    pickupSetting && pickupSetting.value && typeof pickupSetting.value === "object" && !Array.isArray(pickupSetting.value)
      ? (pickupSetting.value as PickupLocation)
      : null;
  const pickup = {
    name: ps?.name ?? process.env.DELHIVERY_PICKUP_NAME ?? "",
    add: ps?.address ?? process.env.DELHIVERY_PICKUP_ADDRESS ?? "",
    city: ps?.city ?? process.env.DELHIVERY_PICKUP_CITY ?? "",
    pin_code: ps?.pin ?? process.env.DELHIVERY_PICKUP_PIN ?? process.env.DELHIVERY_ORIGIN_PINCODE ?? "",
    country: ps?.country ?? process.env.DELHIVERY_PICKUP_COUNTRY ?? "India",
    phone: ps?.phone ?? process.env.DELHIVERY_PICKUP_PHONE ?? "",
    returnAdd: ps?.returnAddress ?? ps?.address ?? "",
    returnPin: ps?.returnPin ?? ps?.pin ?? "",
    returnCity: ps?.returnCity ?? ps?.city ?? "",
    returnState: ps?.returnState ?? ps?.state ?? "",
    returnCountry: ps?.returnCountry ?? ps?.country ?? "India",
  };

  // Content description: real item/service names first, then repair rows and
  // work types, so repair orders don't manifest as the generic fallback.
  const summary = order.summary && typeof order.summary === "object" ? (order.summary as Record<string, unknown>) : {};
  const workTypes = Array.isArray(summary.workTypes)
    ? (summary.workTypes as unknown[]).filter((w): w is string => typeof w === "string")
    : [];
  const productsDesc =
    [
      order.items.map((i) => i.name).concat(order.services.map((s) => s.name)).join(", "),
      order.repairs.map((r) => `${r.deviceType} ${r.deviceModel}${r.issue ? ` — ${r.issue}` : ""}`).join(", "),
      workTypes.join(", "),
    ]
      .filter(Boolean)
      .join(" | ") || "KeebForge package";

  // Declared value for the manifest: admin override wins, otherwise the 
  // largest of the order total / repair quote / customer budget — never ₹0.
  const budgetPaise = Number.isFinite(Number(summary.budget)) && Number(summary.budget) > 0 ? Math.round(Number(summary.budget) * 100) : 0;
  const repairQuotePaise = order.repairs.reduce((s, r) => s + (r.quotePrice ?? 0), 0);
  const declaredPaise = declaredValue ? declaredValue * 100 : Math.max(order.total, repairQuotePaise, budgetPaise);

  const quantity = Math.max(1, order.items.reduce((s, i) => s + i.quantity, 0) || order.services.reduce((s, i) => s + i.quantity, 0));
  const shippingMode = order.shippingMode && /express/i.test(order.shippingMode) ? "Express" : "Surface";

  const input: CreateShipmentInput = {
    consignee: {
      name: order.customerName,
      address: [addr.streetAddress, addr.apartment].filter(Boolean).join(", "),
      pin: addr.postalCode,
      city: addr.city,
      state: addr.state,
      country: addr.country,
      phone: addr.phone ?? order.customerPhone ?? "",
    },
    order: order.orderNumber,
    sellerInv: order.orderNumber,
    totalRupees: String(declaredPaise / 100),
    paymentMode: "Prepaid",
    codAmountRupees: undefined,
    productsDesc,
    quantity,
    weightGrams,
    shipmentLengthCm: lengthCm ?? 20,
    shipmentWidthCm: widthCm ?? 20,
    shipmentHeightCm: heightCm ?? 20,
    shippingMode,
    pickup,
  };

  const result = await createShipment(input);
  if (!result.ok) return { error: result.message };

  try {
    await prisma.$transaction([
      prisma.shipment.upsert({
        where: { orderId },
        update: { courier: "Delhivery", trackingNumber: result.waybill, status: "DISPATCHED", shippedAt: new Date() },
        create: { orderId, courier: "Delhivery", trackingNumber: result.waybill, status: "DISPATCHED", shippedAt: new Date() },
      }),
      prisma.orderTimeline.create({
        data: { orderId, status: "SHIPMENT_BOOKED", note: `Shipment manifested with Delhivery (waybill ${result.waybill}).` },
      }),
    ]);
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("createShipmentDelivery (save) failed:", e);
    return { error: "Shipment created in Delhivery but couldn't be saved locally. Waybill: " + result.waybill };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true, message: result.waybill };
}

const manualPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.coerce.number().int().min(1),
  method: z.string().max(80).optional(),
  markPaid: z.string().optional(),
});

export async function recordManualPayment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = manualPaymentSchema.safeParse({
    orderId: formData.get("orderId"),
    amount: formData.get("amount"),
    method: formData.get("method") || undefined,
    markPaid: formData.get("markPaid") || undefined,
  });
  if (!parsed.success) return { error: "Valid payment amount required." };
  const { orderId, amount, method, markPaid } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      total: true,
      payments: { where: { status: "PAID" }, select: { amount: true } },
    },
  });
  if (!order) return { error: "Order not found." };

  const existingPaid = order.payments.reduce((s, p) => s + p.amount, 0);
  const forcePaid = markPaid === "1";
  const total = forcePaid ? amount : order.total;
  const payAmount = forcePaid ? amount : Math.min(amount, Math.max(0, order.total - existingPaid));
  if (payAmount <= 0) return { error: "Nothing left to pay — amount already covered." };

  const paidAfter = forcePaid ? amount : existingPaid + payAmount;
  const paymentStatus = paymentStatusFor(paidAfter, total);

  try {
    await prisma.$transaction([
      prisma.payment.create({
        data: { orderId, amount: payAmount, status: "PAID", method: method || "manual", paidAt: new Date() },
      }),
      prisma.order.update({ where: { id: orderId }, data: { paymentStatus } }),
      prisma.orderTimeline.create({
        data: { orderId, status: "PAYMENT_RECEIVED", note: `Manual payment of ${payAmount} paise recorded by admin${method ? ` (${method})` : ""}.` },
      }),
    ]);
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("recordManualPayment failed:", e);
    return { error: "Couldn't record payment." };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true };
}

export async function deleteOrder(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("order", "update");
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !orderId) return { error: "Invalid order." };

  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNumber: true } });
  if (!order) return { error: "Order not found." };

  try {
    // Children (items, services, repairs, payments, shipment, timeline,
    // messages, warranty, tracking, couponUsage) cascade on delete.
    await prisma.order.delete({ where: { id: orderId } });
  } catch (e) {
    console.error("deleteOrder failed:", e);
    return { error: "Couldn't delete order." };
  }
  revalidatePath("/admin/orders");
  redirect("/admin/orders");
}
