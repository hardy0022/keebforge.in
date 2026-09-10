"use server";

import { Resend } from "resend";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAuth } from "@/lib/auth/session";
import { generateOrderNumber } from "@/lib/orders";
import { syncTrackingCache } from "@/lib/orders/tracking";
import {
  cloudinaryConfigured,
  deleteImage,
  mediaFolder,
  uploadBuffer,
} from "@/lib/images/cloudinary";
import {
  IMAGE_TYPES_MESSAGE,
  sniffImageType,
} from "@/lib/images/validation";

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export type RepairRequestState = {
  ok?: boolean;
  orderNumber?: string;
  error?: string;
};

const schema = z.object({
  serviceType: z.enum(["custom", "repair", "unsure"]),
  deviceType: z.enum(["KEYBOARD", "MOUSE", "OTHER"]),
  brand: z.string().trim().min(1, "Please tell us the brand.").max(80),
  model: z.string().trim().min(2, "Please enter the model / PCB.").max(120),
  workTypes: z
    .array(z.string().trim().min(1).max(60))
    .min(1, "Select at least one type of work.")
    .max(12),
  description: z
    .string()
    .trim()
    .min(20, "Please describe the job in a little more detail.")
    .max(2000),
  condition: z.string().trim().max(120).optional().default(""),
  budget: z.string().trim().max(40).optional().default(""),
  firstName: z.string().trim().min(1, "Please enter your first name.").max(80),
  lastName: z.string().trim().min(1, "Please enter your last name.").max(80),
  phone: z
    .string()
    .trim()
    .min(10, "Please enter a valid phone number.")
    .max(20)
    .regex(/^[0-9+\-\s()]+$/, "Only digits, +, - and spaces are allowed."),
  email: z
    .string()
    .trim()
    .email("Please enter a valid email address.")
    .max(120),
  contactNotes: z.string().trim().max(200).optional().default(""),
  shippingMethod: z.enum(["SHIP", "PICKUP", "UNSURE"]),
  useAddressId: z.string().trim().max(40).optional().default(""),
  street: z.string().trim().max(280).optional().default(""),
  city: z.string().trim().max(80).optional().default(""),
  state: z.string().trim().max(80).optional().default(""),
  postalCode: z.string().trim().max(10).optional().default(""),
});

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

export async function submitRepairRequest(
  _prev: RepairRequestState,
  formData: FormData,
): Promise<RepairRequestState> {
  const parsed = schema.safeParse({
    serviceType: formData.get("serviceType"),
    deviceType: formData.get("deviceType"),
    brand: formData.get("brand"),
    model: formData.get("model"),
    workTypes: formData.getAll("workTypes").map(String),
    description: formData.get("description"),
    condition: formData.get("condition") ?? undefined,
    budget: formData.get("budget") ?? undefined,
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
    email: formData.get("email"),
    contactNotes: formData.get("contactNotes") ?? undefined,
    shippingMethod: formData.get("shippingMethod"),
    useAddressId: formData.get("useAddressId") ?? undefined,
    street: formData.get("street") ?? undefined,
    city: formData.get("city") ?? undefined,
    state: formData.get("state") ?? undefined,
    postalCode: formData.get("postalCode") ?? undefined,
  });
  if (!parsed.success) {
    return {
      error:
        parsed.error.issues[0]?.message ??
        "Please check your details and try again.",
    };
  }
  const d = parsed.data;
  const fullName = [d.firstName, d.lastName].filter(Boolean).join(" ");

  // Shipping/pickup address: saved profile address or manual entry — required for SHIP and PICKUP.
  let ship: {
    streetAddress: string;
    city: string;
    state: string;
    postalCode: string;
  } | null = null;
  if (d.shippingMethod !== "UNSURE") {
    if (d.useAddressId) {
      const { profile } = await getCurrentAuth();
      const saved = profile
        ? await prisma.address.findFirst({
            where: { id: d.useAddressId, profileId: profile.id },
          })
        : null;
      if (!saved)
        return {
          error:
            "Selected address could not be found — please pick an address again.",
        };
      ship = {
        streetAddress: saved.streetAddress,
        city: saved.city,
        state: saved.state,
        postalCode: saved.postalCode,
      };
    } else {
      if (!d.street || !d.city || !d.state || !/^\d{6}$/.test(d.postalCode)) {
        return {
          error: "Please complete the pickup address (6-digit PIN code).",
        };
      }
      ship = {
        streetAddress: d.street,
        city: d.city,
        state: d.state,
        postalCode: d.postalCode,
      };
    }
  }

  const orderNumber = generateOrderNumber();
  const { profile } = await getCurrentAuth();

  // Photos (optional): validate by bytes before any write so a bad upload
  // never creates (or duplicates) an order. Uploaded to the order's own
  // Cloudinary folder after the row exists, mirrored in review.ts.
  const rawPhotos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File);
  if (rawPhotos.length > MAX_PHOTOS)
    return { error: `You can attach at most ${MAX_PHOTOS} photos.` };
  if (rawPhotos.length > 0 && !cloudinaryConfigured()) {
    return {
      error:
        "Photo upload is temporarily unavailable — you can submit your request without photos.",
    };
  }
  const photos = await Promise.all(
    rawPhotos.map(async (f) => ({
      name: f.name,
      buffer: Buffer.from(await f.arrayBuffer()),
    })),
  );
  for (const img of photos) {
    if (img.buffer.length > MAX_PHOTO_BYTES)
      return {
        error: `Each photo must be under 3 MB — "${img.name}" is too large.`,
      };
    if (!sniffImageType(img.buffer))
      return {
        error: `"${img.name}" isn't a valid image. ${IMAGE_TYPES_MESSAGE}`,
      };
  }

  // Upload into the per-order folder now so a Cloudinary hiccup is surfaced
  // before the order is persisted (no request without its photos surviving
  // silently); assets are rolled back if persisting the order then fails.
  const uploaded: {
    url: string;
    publicId: string;
    width: number;
    height: number;
  }[] = [];
  let photoFolder = "";
  if (photos.length > 0) {
    photoFolder = mediaFolder("WORK", orderNumber);
    try {
      for (const img of photos) {
        uploaded.push(await uploadBuffer(img.buffer, { folder: photoFolder }));
      }
    } catch (e) {
      console.error("Repair photo upload error:", e);
      for (const u of uploaded) await deleteImage(u.publicId).catch(() => {});
      return {
        error:
          "One or more photos failed to upload. Please retry, or submit without photos.",
      };
    }
  }

  try {
    const order = await prisma.order.create({
      data: {
        orderNumber,
        type: "REPAIR",
        status: "ORDER_RECEIVED",
        paymentStatus: "PENDING",
        profileId: profile?.id ?? null,
        customerName: fullName,
        customerEmail: d.email.toLowerCase(),
        customerPhone: d.phone,
        summary: {
          serviceType: d.serviceType,
          deviceType: d.deviceType,
          brand: d.brand,
          model: d.model,
          workTypes: d.workTypes,
          condition: d.condition || null,
          budget: d.budget || null,
          contactNotes: d.contactNotes || null,
          hasQuotes: true,
        },
        ...(ship
          ? {
              shippingAddress: {
                create: {
                  label: "Shipping",
                  streetAddress: ship.streetAddress,
                  city: ship.city,
                  state: ship.state,
                  postalCode: ship.postalCode,
                  phone: d.phone,
                },
              },
            }
          : {}),
        repairs: {
          create: {
            deviceType: d.deviceType,
            deviceModel: [d.brand, d.model].filter(Boolean).join(" "),
            issue: d.description,
            notes: JSON.stringify({
              serviceType: d.serviceType,
              workTypes: d.workTypes,
              condition: d.condition || null,
              budget: d.budget || null,
            }),
          },
        },
        timeline: {
          create: {
            status: "ORDER_RECEIVED",
            note: "Custom work & repair request submitted — final pricing after inspection.",
          },
        },
      },
    });

    await syncTrackingCache(order.id);

    // Persist uploaded photos against the order (entityId = order.id, folder =
    // the per-order /work folder above). A Media-row failure only orphans the
    // Cloudinary assets — never the request.
    if (uploaded.length > 0) {
      try {
        await prisma.media.createMany({
          data: uploaded.map((u, i) => ({
            publicId: u.publicId,
            secureUrl: u.url,
            entityType: "ORDER" as const,
            entityId: order.id,
            folder: photoFolder,
            role: "CUSTOMER_UPLOAD" as const,
            sortOrder: i,
            width: u.width,
            height: u.height,
          })),
        });
      } catch (e) {
        console.error("Repair photo persist error:", e);
        for (const u of uploaded) await deleteImage(u.publicId).catch(() => {});
      }
    }
  } catch (e) {
    console.error("Repair request persist error:", e);
    // Roll back any photos already on Cloudinary — the order itself failed.
    for (const u of uploaded) await deleteImage(u.publicId).catch(() => {});
    return {
      error:
        "The request could not be saved right now. Please email contact@keebforge.in directly.",
    };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const rows: Array<[string, string]> = [
      ["Reference", orderNumber],
      ["Service", d.serviceType],
      ["Device", d.deviceType],
      ["Brand", d.brand],
      ["Model / PCB", d.model],
      ["Work required", d.workTypes.join(", ")],
      ["Condition", d.condition || "—"],
      ["Budget estimate", d.budget || "—"],
      ["Description", d.description],
      ["Name", fullName],
      ["Phone", d.phone],
      ["Email", d.email],
      ["Extra contact", d.contactNotes || "—"],
      [
        "Shipping",
        d.shippingMethod +
          (ship
            ? ` — ${ship.streetAddress}, ${ship.city}, ${ship.state} ${ship.postalCode}`
            : ""),
      ],
      uploaded.length > 0
        ? ["Photos", uploaded.map((u) => u.url).join("\n")]
        : ["Photos", "None"],
    ];
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "KeebForge <onboarding@resend.dev>",
      to: ["contact@keebforge.in"],
      replyTo: d.email,
      subject: `[${orderNumber}] Custom Work & Repair Request — ${d.brand} ${d.model}`,
      html:
        `<h2>Custom Work &amp; Repair Request — KeebForge.in</h2>` +
        `<table cellpadding="6" style="font-family:sans-serif;font-size:14px;color:#1a1a1a">` +
        rows
          .map(
            ([k, v]) =>
              `<tr><td><strong>${esc(k)}</strong></td><td>${esc(v)}</td></tr>`,
          )
          .join("") +
        `</table>`,
    });
  } catch (e) {
    // The order is already persisted — an email hiccup must not fail the request.
    console.error("Resend error (repair request):", e);
  }

  return { ok: true, orderNumber };
}
