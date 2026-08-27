"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ServiceUnit } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";

export type ServiceActionState = { ok?: boolean; error?: string; message?: string };

const serviceSchema = z.object({
  id: z.string().min(1, "Service id missing."),
  unit: z.nativeEnum(ServiceUnit),
  price: z.string().optional(),
  priceMin: z.string().optional(),
  priceMax: z.string().optional(),
  priceLabel: z.string().trim().optional(),
  popular: z.string().optional(),
  highlight: z.string().optional(),
  combo: z.string().optional(),
  active: z.string().optional(),
  sortOrder: z.string().optional(),
});

/** "12.5" | "" → paise; blank → null. */
function toPaise(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) ? n : null;
}

export async function saveService(_prev: ServiceActionState, formData: FormData): Promise<ServiceActionState> {
  await requirePermission("service", "create");
  const parsed = serviceSchema.safeParse({
    id: formData.get("id") || undefined,
    unit: formData.get("unit"),
    price: formData.get("price") || undefined,
    priceMin: formData.get("priceMin") || undefined,
    priceMax: formData.get("priceMax") || undefined,
    priceLabel: formData.get("priceLabel") || undefined,
    popular: formData.get("popular") || undefined,
    highlight: formData.get("highlight") || undefined,
    combo: formData.get("combo") || undefined,
    active: formData.get("active") || undefined,
    sortOrder: formData.get("sortOrder") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid service." };
  const d = parsed.data;

  const price = toPaise(d.price);
  const priceMin = toPaise(d.priceMin);
  const priceMax = toPaise(d.priceMax);

  if (price == null && priceMin == null && d.unit !== ServiceUnit.QUOTE) {
    return { error: "Set a price (or a price range), or set unit to Quote." };
  }

  await prisma.service.update({
    where: { id: d.id },
    data: {
      unit: d.unit,
      price,
      priceMin,
      priceMax,
      priceLabel: d.priceLabel || null,
      popular: d.popular === "on",
      highlight: d.highlight === "on",
      combo: d.combo === "on",
      active: d.active === "on" || d.active === undefined,
      sortOrder: d.sortOrder ? parseInt(d.sortOrder, 10) || 0 : 0,
    },
  });

  revalidatePath("/admin/services");
  revalidatePath("/mods");
  return { ok: true, message: `${d.active === undefined ? "" : ""}Service saved` };
}