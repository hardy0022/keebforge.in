"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/auth/admin";
import { readPriceOnly } from "@/lib/admin/pricing";
import { invalidateServices } from "@/lib/caching/cache";

export type ModActionState = { ok?: boolean; error?: string; message?: string };

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
