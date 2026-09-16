"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/admin";
import { invalidateServices } from "@/lib/caching/cache";

export type ModActionState = { ok?: boolean; error?: string; message?: string };

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
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid mod." };
  const d = parsed.data;
  const price = toPaise(d.price);
  const priceMin = toPaise(d.priceMin);
  const priceMax = toPaise(d.priceMax);
  if (price == null && priceMin == null) {
    return { error: "Set a price or a price range." };
  }
  return { data: { ...d, price, priceMin, priceMax } };
}

export async function updateModPrice(
  _prev: ModActionState,
  formData: FormData,
): Promise<ModActionState> {
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
  invalidateServices();
  return { ok: true, message: "Price updated" };
}
