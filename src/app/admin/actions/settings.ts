"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";
import type { ActionState } from "@/components/admin/ActionForm";
import { MAINTENANCE_KEY, type Environment } from "@/lib/environment";
import {
  PICKUP_SETTING_KEY,
  createDelhiveryWarehouse,
  editDelhiveryWarehouse,
  type PickupLocation,
} from "@/lib/delhivery";
import { invalidateSiteSettings } from "@/lib/caching/cache";

const ENVIRONMENTS: Environment[] = ["production", "development"];

export async function toggleMaintenanceMode(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("setting", "update");

  const target = formData.get("environment");
  const env: Environment | undefined = ENVIRONMENTS.find((e) => e === target);
  if (!env) return { ok: false, error: "Invalid environment." };

  const key = MAINTENANCE_KEY[env];
  const current = await prisma.siteSetting.findUnique({ where: { key } });
  const next = current?.value === true ? false : true;

  await prisma.siteSetting.upsert({
    where: { key },
    update: { value: next as Prisma.InputJsonValue },
    create: { key, value: next as Prisma.InputJsonValue },
  });

  revalidatePath("/admin/settings");
  invalidateSiteSettings();

  const label = env === "production" ? "Production" : "Development";
  return {
    ok: true,
    message: `${label} maintenance mode ${next ? "enabled" : "disabled"}.`,
  };
}

const pickupSchema = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(300),
  city: z.string().trim().min(1).max(120),
  pin: z
    .string()
    .trim()
    .regex(/^[1-9]\d{5}$/),
  state: z.string().trim().min(1).max(120),
  country: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().min(10).max(15),
  email: z.string().trim().email().optional().or(z.literal("")),
  registeredName: z.string().trim().max(120).optional(),
});

/**
 * Saves the Delhivery pickup (warehouse) location for use when manifesting
 * shipments, and registers it via the ClientWarehouse Create API so
 * pickup_location.name matches a warehouse in Delhivery's system. If the
 * warehouse already exists, it's updated via the ClientWarehouse Edit API.
 */
export async function saveDelhiveryPickup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requirePermission("setting", "update");

  const parsed = pickupSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address"),
    city: formData.get("city"),
    pin: formData.get("pin"),
    state: formData.get("state"),
    country: formData.get("country") || undefined,
    phone: formData.get("phone"),
    email: formData.get("email") || undefined,
    registeredName: formData.get("registeredName") || undefined,
  });
  if (!parsed.success)
    return {
      ok: false,
      error:
        "Check the pickup location fields (pincode must be 6 digits, phone at least 10).",
    };
  const d = parsed.data;
  const country = d.country ?? "India";

  const full: PickupLocation = {
    name: d.name,
    address: d.address,
    city: d.city,
    pin: d.pin,
    state: d.state,
    country,
    phone: d.phone,
    email: d.email ?? "",
    registeredName: d.registeredName || d.name,
    returnAddress: d.address,
    returnPin: d.pin,
    returnCity: d.city,
    returnState: d.state,
    returnCountry: country,
  };

  // Register the warehouse with Delhivery. If it already exists (create
  // refuses), push name/phone/address edits through the updation API instead.
  const res = await createDelhiveryWarehouse(full);
  if (!res.ok) {
    const edited = await editDelhiveryWarehouse(full);
    if (!edited.ok) {
      return {
        ok: false,
        error:
          edited.message ||
          "Couldn't register or update the warehouse with Delhivery.",
      };
    }
  }

  await prisma.siteSetting.upsert({
    where: { key: PICKUP_SETTING_KEY },
    update: { value: full as Prisma.InputJsonValue },
    create: { key: PICKUP_SETTING_KEY, value: full as Prisma.InputJsonValue },
  });

  revalidatePath("/admin/settings");
  invalidateSiteSettings();
  return {
    ok: true,
    message: "Pickup location saved and registered with Delhivery.",
  };
}
