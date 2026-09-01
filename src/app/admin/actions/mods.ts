"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ServiceUnit } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";

export type ModActionState = { ok?: boolean; error?: string; message?: string };

const modSchema = z.object({
  id: z.string().min(1, "Mod id missing."),
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

const priceOnlySchema = z.object({
  id: z.string().min(1, "Mod id missing."),
  price: z.string().optional(),
  priceMin: z.string().optional(),
  priceMax: z.string().optional(),
  priceLabel: z.string().trim().optional(),
});

function readPriceOnly(formData: FormData) {
  const parsed = priceOnlySchema.safeParse({
    id: formData.get("id") || undefined,
    price: formData.get("price") || undefined,
    priceMin: formData.get("priceMin") || undefined,
    priceMax: formData.get("priceMax") || undefined,
    priceLabel: formData.get("priceLabel") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid mod." };
  const d = parsed.data;
  const price = toPaise(d.price);
  const priceMin = toPaise(d.priceMin);
  const priceMax = toPaise(d.priceMax);
  if (price == null && priceMin == null) {
    return { error: "Set a price or a price range." };
  }
  return { data: { ...d, price, priceMin, priceMax } };
}

export async function updateModPrice(_prev: ModActionState, formData: FormData): Promise<ModActionState> {
  await requirePermission("mod", "update");
  const r = readPriceOnly(formData);
  if ("error" in r) return { error: r.error };
  await prisma.service.update({
    where: { id: r.data.id },
    data: {
      price: r.data.price,
      priceMin: r.data.priceMin,
      priceMax: r.data.priceMax,
      priceLabel: r.data.priceLabel || null,
    },
  });
  revalidatePath("/admin/mods");
  revalidatePath("/mods");
  return { ok: true, message: "Price updated" };
}

export async function saveMod(_prev: ModActionState, formData: FormData): Promise<ModActionState> {
  await requirePermission("mod", "create");
  const parsed = modSchema.safeParse({
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
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid mod." };
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

  revalidatePath("/admin/mods");
  revalidatePath("/mods");
  return { ok: true, message: "Mod saved" };
}