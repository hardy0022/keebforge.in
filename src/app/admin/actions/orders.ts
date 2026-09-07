"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";
import { syncTrackingCache } from "@/lib/tracking";
import {
  bookPickup,
  cancelShipment,
  createShipment,
  editShipment,
  PICKUP_SETTING_KEY,
  type CreateShipmentInput,
  type PickupLocation,
} from "@/lib/delhivery";

export type ActionState = { ok?: boolean; error?: string; message?: string };

const rupees = (paise: number) => (paise / 100).toFixed(2).replace(/\.00$/, "");

/** Pickup location from the admin Settings card (PICKUP_SETTING_KEY), falling
 * back to DELHIVERY_PICKUP_* env vars, then DELHIVERY_ORIGIN_PINCODE. */
async function resolvePickupLocation(): Promise<PickupLocation | null> {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: PICKUP_SETTING_KEY },
  });
  if (
    setting?.value &&
    typeof setting.value === "object" &&
    !Array.isArray(setting.value)
  ) {
    return setting.value as unknown as PickupLocation;
  }
  return null;
}

function pickupLocationFromPs(ps: PickupLocation | null): {
  name: string;
  add: string;
  city: string;
  pin_code: string;
  country: string;
  phone: string;
  returnAdd: string;
  returnPin: string;
  returnCity: string;
  returnState: string;
  returnCountry: string;
} {
  return {
    name: ps?.name ?? process.env.DELHIVERY_PICKUP_NAME ?? "",
    add: ps?.address ?? process.env.DELHIVERY_PICKUP_ADDRESS ?? "",
    city: ps?.city ?? process.env.DELHIVERY_PICKUP_CITY ?? "",
    pin_code:
      ps?.pin ??
      process.env.DELHIVERY_PICKUP_PIN ??
      process.env.DELHIVERY_ORIGIN_PINCODE ??
      "",
    country: ps?.country ?? process.env.DELHIVERY_PICKUP_COUNTRY ?? "India",
    phone: ps?.phone ?? process.env.DELHIVERY_PICKUP_PHONE ?? "",
    returnAdd: ps?.returnAddress ?? ps?.address ?? "",
    returnPin: ps?.returnPin ?? ps?.pin ?? "",
    returnCity: ps?.returnCity ?? ps?.city ?? "",
    returnState: ps?.returnState ?? ps?.state ?? "",
    returnCountry: ps?.returnCountry ?? ps?.country ?? "India",
  };
}

const statusSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum([
    "ORDER_RECEIVED",
    "ORDER_CONFIRMED",
    "PAYMENT_PENDING",
    "PAYMENT_RECEIVED",
    "PARTS_BOOKED",
    "PARTS_SHIPPED",
    "PARTS_RECEIVED",
    "IN_QUEUE",
    "WORK_STARTED",
    "TESTING",
    "COMPLETED",
    "PACKING",
    "SHIPMENT_BOOKED",
    "SHIPMENT_PICKED_UP",
    "IN_TRANSIT",
    "DELIVERED",
    "TESTING_WARRANTY_ACTIVE",
    "ORDER_COMPLETED",
  ]),
  note: z.string().max(2000).optional(),
});

export async function updateOrderStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = statusSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: "Invalid status." };
  const { orderId, status, note } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, orderNumber: true },
  });
  if (!order) return { error: "Order not found." };

  // Idempotent replay: an identical status with no new note is a no-op, so a
  // double-click or retried request can't mint duplicate timeline entries.
  if (order.status === status && !note) return { ok: true };

  try {
    await prisma.$transaction([
      prisma.order.update({ where: { id: orderId }, data: { status } }),
      prisma.orderTimeline.create({
        data: { orderId, status, note: note ?? null },
      }),
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

export async function addTimelineEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = timelineSchema.safeParse({
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    note: formData.get("note") || "",
  });
  if (!parsed.success) return { error: "Status and note are required." };
  const { orderId, status, note } = parsed.data;

  const enumVal = status as z.infer<typeof statusSchema>["status"];
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  if (!order) return { error: "Order not found." };

  try {
    await prisma.orderTimeline.create({
      data: { orderId, status: enumVal, note: note || null },
    });
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
  status: z
    .enum([
      "NOT_DISPATCHED",
      "DISPATCHED",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "RETURNED",
    ])
    .optional(),
});

export async function updateShipping(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
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

export async function addOrderNote(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = notesSchema.safeParse({
    orderId: formData.get("orderId"),
    message: formData.get("message") || "",
    visibleToCustomer: formData.get("visibleToCustomer") || undefined,
  });
  if (!parsed.success || !parsed.data.message.trim())
    return { error: "Note cannot be empty." };
  const { orderId, message, visibleToCustomer } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
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
function paymentStatusFor(
  paid: number,
  total: number,
): "PAID" | "PARTIALLY_PAID" | "PENDING" {
  if (total > 0 && paid >= total) return "PAID";
  if (paid > 0) return "PARTIALLY_PAID";
  return "PENDING";
}

export async function updateOrderAmounts(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
    select: {
      orderNumber: true,
      payments: { where: { status: "PAID" }, select: { amount: true } },
    },
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
        data: {
          orderId,
          status: "PAYMENT_PENDING",
          note: `Amounts updated by admin (subtotal ₹${rupees(subtotal)}, shipping ₹${rupees(shipping)}, discount ₹${rupees(discount)}, total ₹${rupees(total)}).`,
        },
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

export async function updateOrderAddress(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
  const {
    orderId,
    label,
    streetAddress,
    apartment,
    city,
    state,
    postalCode,
    country,
    phone,
  } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
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
export async function createShipmentDelivery(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = createShipmentSchema.safeParse({
    orderId: formData.get("orderId"),
    weightGrams: formData.get("weightGrams") || undefined,
    widthCm: formData.get("widthCm") || undefined,
    heightCm: formData.get("heightCm") || undefined,
    lengthCm: formData.get("lengthCm") || undefined,
    declaredValue: formData.get("declaredValue") || undefined,
  });
  if (!parsed.success)
    return { error: "Check the shipment fields (dimensions must be ≥ 1 cm)." };
  const {
    orderId,
    weightGrams: enteredWeight,
    widthCm,
    heightCm,
    lengthCm,
    declaredValue,
  } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      shippingAddress: true,
      items: { select: { name: true, quantity: true } },
      services: { select: { name: true, quantity: true } },
      repairs: {
        select: {
          deviceType: true,
          deviceModel: true,
          issue: true,
          quotePrice: true,
        },
      },
      shipment: { select: { trackingNumber: true } },
    },
  });
  if (!order) return { error: "Order not found." };
  if (order.shipment?.trackingNumber) {
    return {
      error: `This order is already dispatched (waybill ${order.shipment.trackingNumber}).`,
    };
  }
  const addr = order.shippingAddress;
  if (!addr) return { error: "Add a shipping address to this order first." };

  const weightGrams = enteredWeight ?? order.shippingWeightGrams;
  if (!weightGrams || weightGrams < 1)
    return { error: "A shipment weight (grams) is required." };

  // Pickup location from the admin Settings card (PICKUP_SETTING_KEY), falling
  // back to DELHIVERY_PICKUP_* env vars, then DELHIVERY_ORIGIN_PINCODE. The
  // return fields default to the same warehouse so RTO packages have an address.
  const pickup = pickupLocationFromPs(await resolvePickupLocation());

  // Content description: real item/service names first, then repair rows and
  // work types, so repair orders don't manifest as the generic fallback.
  const summary =
    order.summary && typeof order.summary === "object"
      ? (order.summary as Record<string, unknown>)
      : {};
  const workTypes = Array.isArray(summary.workTypes)
    ? (summary.workTypes as unknown[]).filter(
        (w): w is string => typeof w === "string",
      )
    : [];
  const productsDesc =
    [
      order.items
        .map((i) => i.name)
        .concat(order.services.map((s) => s.name))
        .join(", "),
      order.repairs
        .map(
          (r) =>
            `${r.deviceType} ${r.deviceModel}${r.issue ? ` — ${r.issue}` : ""}`,
        )
        .join(", "),
      workTypes.join(", "),
    ]
      .filter(Boolean)
      .join(" | ") || "KeebForge package";

  // Declared value for the manifest: admin override wins, otherwise the
  // largest of the order total / repair quote / customer budget — never ₹0.
  const budgetPaise =
    Number.isFinite(Number(summary.budget)) && Number(summary.budget) > 0
      ? Math.round(Number(summary.budget) * 100)
      : 0;
  const repairQuotePaise = order.repairs.reduce(
    (s, r) => s + (r.quotePrice ?? 0),
    0,
  );
  const declaredPaise = declaredValue
    ? declaredValue * 100
    : Math.max(order.total, repairQuotePaise, budgetPaise);

  const quantity = Math.max(
    1,
    order.items.reduce((s, i) => s + i.quantity, 0) ||
      order.services.reduce((s, i) => s + i.quantity, 0),
  );
  const shippingMode =
    order.shippingMode && /express/i.test(order.shippingMode)
      ? "Express"
      : "Surface";

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
        update: {
          courier: "Delhivery",
          trackingNumber: result.waybill,
          status: "DISPATCHED",
          shippedAt: new Date(),
        },
        create: {
          orderId,
          courier: "Delhivery",
          trackingNumber: result.waybill,
          status: "DISPATCHED",
          shippedAt: new Date(),
        },
      }),
      prisma.orderTimeline.create({
        data: {
          orderId,
          status: "SHIPMENT_BOOKED",
          note: `Shipment manifested with Delhivery (waybill ${result.waybill}).`,
        },
      }),
    ]);
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("createShipmentDelivery (save) failed:", e);
    return {
      error:
        "Shipment created in Delhivery but couldn't be saved locally. Waybill: " +
        result.waybill,
    };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true, message: result.waybill };
}

const updateShipmentSchema = z.object({
  orderId: z.string().min(1),
  weightGrams: z.coerce.number().min(0.1),
  paymentType: z.enum(["Pre-paid", "COD"]).default("Pre-paid"),
  codAmount: z.coerce.number().min(0).optional(),
  lengthCm: z.coerce.number().min(1).optional(),
  widthCm: z.coerce.number().min(1).optional(),
  heightCm: z.coerce.number().min(1).optional(),
});

/**
 * Adjusts an already-manifested Delhivery shipment (weight / dimensions / COD)
 * via /api/p/edit, then records a timeline entry.
 */
export async function updateShipmentDelivery(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = updateShipmentSchema.safeParse({
    orderId: formData.get("orderId"),
    weightGrams: formData.get("weightGrams"),
    paymentType: formData.get("paymentType") || undefined,
    codAmount: formData.get("codAmount") || undefined,
    lengthCm: formData.get("lengthCm") || undefined,
    widthCm: formData.get("widthCm") || undefined,
    heightCm: formData.get("heightCm") || undefined,
  });
  if (!parsed.success)
    return { error: "Check the fields — weight (grams) is required." };
  const {
    orderId,
    weightGrams,
    paymentType,
    codAmount,
    lengthCm,
    widthCm,
    heightCm,
  } = parsed.data;
  if (paymentType === "COD" && codAmount == null)
    return { error: "Enter the COD amount for a COD shipment." };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      shipment: { select: { trackingNumber: true } },
    },
  });
  if (!order) return { error: "Order not found." };
  const waybill = order.shipment?.trackingNumber;
  if (!waybill)
    return { error: "No Delhivery shipment exists for this order yet." };

  const result = await editShipment({
    waybill,
    pt: paymentType,
    cod: paymentType === "COD" ? codAmount : undefined,
    gm: weightGrams,
    shipmentLengthCm: lengthCm,
    shipmentWidthCm: widthCm,
    shipmentHeightCm: heightCm,
  });
  if (!result.ok) return { error: result.message };

  try {
    await prisma.orderTimeline.create({
      data: {
        orderId,
        status: "SHIPMENT_BOOKED",
        note:
          paymentType === "COD"
            ? `Shipment ${waybill} updated with Delhivery (weight ${weightGrams} gm, COD ₹${rupees(codAmount! * 100)}).`
            : `Shipment ${waybill} updated with Delhivery (weight ${weightGrams} gm).`,
      },
    });
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("updateShipmentDelivery (timeline) failed:", e);
    return {
      error:
        "Shipment updated in Delhivery but the timeline note couldn't be saved (waybill " +
        waybill +
        ").",
    };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true, message: `Shipment ${waybill} updated` };
}

const cancelShipmentSchema = z.object({
  orderId: z.string().min(1),
  confirm: z.string().min(1),
});

/**
 * Cancels a manifested Delhivery shipment via /api/p/edit, then clears the
 * local tracking number so the order can be re-manifested.
 */
export async function cancelShipmentDelivery(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = cancelShipmentSchema.safeParse({
    orderId: formData.get("orderId"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success || !/^yes$/i.test(parsed.data.confirm.trim()))
    return { error: "Type YES to confirm cancellation." };
  const { orderId } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      shipment: { select: { trackingNumber: true } },
    },
  });
  if (!order) return { error: "Order not found." };
  const waybill = order.shipment?.trackingNumber;
  if (!waybill) return { error: "No Delhivery shipment to cancel." };

  const result = await cancelShipment(waybill);
  if (!result.ok) return { error: result.message };

  try {
    await prisma.$transaction([
      prisma.shipment.update({
        where: { orderId },
        data: {
          trackingNumber: null,
          status: "NOT_DISPATCHED",
          shippedAt: null,
        },
      }),
      prisma.orderTimeline.create({
        data: {
          orderId,
          status: "SHIPMENT_BOOKED",
          note: `Shipment ${waybill} cancelled with Delhivery. This order can be manifested again.`,
        },
      }),
    ]);
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("cancelShipmentDelivery (save) failed:", e);
    return {
      error:
        "Shipment cancelled in Delhivery but couldn't update the order locally (waybill " +
        waybill +
        ").",
    };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return { ok: true, message: `Shipment ${waybill} cancelled` };
}

const bookPickupSchema = z.object({
  orderId: z.string().min(1),
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickupTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  packageCount: z.coerce.number().int().min(1).max(100),
});

/**
 * Books a Delhivery courier pickup at the configured warehouse
 * (/fm/request/new/) and records a timeline entry.
 */
export async function bookPickupDelivery(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = bookPickupSchema.safeParse({
    orderId: formData.get("orderId"),
    pickupDate: formData.get("pickupDate"),
    pickupTime: formData.get("pickupTime"),
    packageCount: formData.get("packageCount"),
  });
  if (!parsed.success)
    return { error: "Enter a pickup date, time, and package count." };
  const { orderId, pickupDate, pickupTime, packageCount } = parsed.data;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
  if (!order) return { error: "Order not found." };

  const pickup = pickupLocationFromPs(await resolvePickupLocation());
  if (!pickup.name)
    return {
      error:
        "Set a Delhivery Pickup Location in Admin → Settings → Shipping first.",
    };
  const time = pickupTime.length === 5 ? `${pickupTime}:00` : pickupTime;

  // Delhivery rejects past pickups; convert the IST date+time input to a UTC
  // instant (IST is fixed +05:30, no DST) and fail fast with a clear message.
  const pickupAt = Date.parse(`${pickupDate}T${time}+05:30`);
  if (!Number.isFinite(pickupAt) || pickupAt <= Date.now()) {
    return { error: "Pickup must be at a future time (IST)." };
  }

  const result = await bookPickup({
    pickupLocation: pickup.name,
    pickupDate,
    pickupTime: time,
    expectedPackageCount: packageCount,
  });
  if (!result.ok) return { error: result.message };

  try {
    await prisma.orderTimeline.create({
      data: {
        orderId,
        status: "SHIPMENT_BOOKED",
        note: `Pickup booked with Delhivery for ${pickupDate} ${time} from ${pickup.name} (${packageCount} package${packageCount === 1 ? "" : "s"}).`,
      },
    });
    await syncTrackingCache(orderId);
  } catch (e) {
    console.error("bookPickupDelivery (timeline) failed:", e);
    return {
      error:
        "Pickup booked with Delhivery but the timeline note couldn't be saved.",
    };
  }
  revalidatePath(`/admin/orders/${order.orderNumber}`);
  return {
    ok: true,
    message: `Pickup booked for ${pickupDate} ${time}`,
  };
}

const warehousePickupSchema = z.object({
  pickupDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  pickupTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  packageCount: z.coerce.number().int().min(1).max(1000),
});

/**
 * Books a warehouse pickup from the /admin/shipments page — not tied to one
 * order/timeline (a pickup covers every manifested package at the warehouse).
 */
export async function bookWarehousePickup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("order", "update");
  const parsed = warehousePickupSchema.safeParse({
    pickupDate: formData.get("pickupDate"),
    pickupTime: formData.get("pickupTime"),
    packageCount: formData.get("packageCount"),
  });
  if (!parsed.success)
    return { error: "Enter a pickup date, time, and package count." };
  const { pickupDate, pickupTime, packageCount } = parsed.data;

  const pickup = pickupLocationFromPs(await resolvePickupLocation());
  if (!pickup.name)
    return {
      error:
        "Set a Delhivery Pickup Location in Admin → Settings → Shipping first.",
    };
  const time = pickupTime.length === 5 ? `${pickupTime}:00` : pickupTime;

  const pickupAt = Date.parse(`${pickupDate}T${time}+05:30`);
  if (!Number.isFinite(pickupAt) || pickupAt <= Date.now()) {
    return { error: "Pickup must be at a future time (IST)." };
  }

  const result = await bookPickup({
    pickupLocation: pickup.name,
    pickupDate,
    pickupTime: time,
    expectedPackageCount: packageCount,
  });
  if (!result.ok) return { error: result.message };
  return {
    ok: true,
    message: `Pickup booked for ${pickupDate} ${time} from ${pickup.name}`,
  };
}
const manualPaymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.coerce.number().int().min(1),
  method: z.string().max(80).optional(),
  markPaid: z.string().optional(),
});

export async function recordManualPayment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
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
  const payAmount = forcePaid
    ? amount
    : Math.min(amount, Math.max(0, order.total - existingPaid));
  if (payAmount <= 0)
    return { error: "Nothing left to pay — amount already covered." };

  const paidAfter = forcePaid ? amount : existingPaid + payAmount;
  const paymentStatus = paymentStatusFor(paidAfter, total);

  try {
    await prisma.$transaction([
      prisma.payment.create({
        data: {
          orderId,
          amount: payAmount,
          status: "PAID",
          method: method || "manual",
          paidAt: new Date(),
        },
      }),
      prisma.order.update({ where: { id: orderId }, data: { paymentStatus } }),
      prisma.orderTimeline.create({
        data: {
          orderId,
          status: "PAYMENT_RECEIVED",
          note: `Manual payment of ${payAmount} paise recorded by admin${method ? ` (${method})` : ""}.`,
        },
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

export async function deleteOrder(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("order", "update");
  const orderId = formData.get("orderId");
  if (typeof orderId !== "string" || !orderId)
    return { error: "Invalid order." };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { orderNumber: true },
  });
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
