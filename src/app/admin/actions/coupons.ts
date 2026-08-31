"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CouponType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";
import type { ActionState } from "@/components/admin/ActionForm";

const couponSchema = z.object({
  id: z.string().optional(),
  code: z.string().trim().min(1, "Code is required.").max(40).transform((c) => c.toUpperCase()),
  type: z.nativeEnum(CouponType),
  value: z.string().trim().min(1, "Value is required."),
  minOrder: z.string().trim().optional(),
  maxDiscount: z.string().trim().optional(),
  usageLimit: z.string().trim().optional(),
  perCustomerLimit: z.string().trim().optional(),
  startsAt: z.string().trim().optional(),
  expiresAt: z.string().trim().optional(),
});

function toPaiseOrNull(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toIntOrNull(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function saveCoupon(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("coupon", "update");

  const parsed = couponSchema.safeParse({
    id: formData.get("id") || undefined,
    code: formData.get("code") || undefined,
    type: formData.get("type"),
    value: formData.get("value") || undefined,
    minOrder: formData.get("minOrder") || undefined,
    maxDiscount: formData.get("maxDiscount") || undefined,
    usageLimit: formData.get("usageLimit") || undefined,
    perCustomerLimit: formData.get("perCustomerLimit") || undefined,
    startsAt: formData.get("startsAt") || undefined,
    expiresAt: formData.get("expiresAt") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid coupon." };
  const d = parsed.data;

  const value = parseFloat(d.value);
  if (!Number.isFinite(value) || value <= 0) return { error: "Value must be a positive number." };
  if (d.type === CouponType.PERCENT && (value > 100 || value % 1 !== 0)) {
    return { error: "Percent coupons must be a whole number between 1 and 100." };
  }

  const data = {
    code: d.code,
    type: d.type,
    value: d.type === CouponType.PERCENT ? value : Math.round(value * 100),
    minOrder: toPaiseOrNull(d.minOrder),
    maxDiscount: toPaiseOrNull(d.maxDiscount),
    usageLimit: toIntOrNull(d.usageLimit),
    perCustomerLimit: toIntOrNull(d.perCustomerLimit),
    startsAt: d.startsAt ? new Date(d.startsAt) : null,
    expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
  };

  if (data.startsAt && data.expiresAt && data.startsAt > data.expiresAt) {
    return { error: "Start date must be before the expiry date." };
  }

  // Keep historical usage counts on edit — only mute tracking-unrelated edits.
  // Active is managed via the Enable/Disable toggle, not the form.
  if (d.id) {
    await prisma.coupon.update({ where: { id: d.id }, data });
  } else {
    const existing = await prisma.coupon.findUnique({ where: { code: d.code } });
    if (existing) return { error: `A coupon with code ${d.code} already exists.` };
    await prisma.coupon.create({ data: { ...data, active: true } });
  }

  revalidatePath("/admin/coupons");
  return { ok: true, message: d.id ? `Coupon ${d.code} updated.` : `Coupon ${d.code} created.` };
}

export async function toggleCoupon(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("coupon", "update");
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Coupon id missing." };
  const coupon = await prisma.coupon.findUnique({ where: { id } });
  if (!coupon) return { error: "Coupon not found." };
  await prisma.coupon.update({ where: { id }, data: { active: !coupon.active } });
  revalidatePath("/admin/coupons");
  return { ok: true, message: `${coupon.code} ${coupon.active ? "disabled" : "enabled"}.` };
}

export async function deleteCoupon(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requirePermission("coupon", "update");
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Coupon id missing." };
  const force = formData.get("force") === "true";

  const usedCount = await prisma.couponUsage.count({ where: { couponId: id } });
  if (usedCount > 0 && !force) {
    return { error: "Cannot delete — this coupon has been used on orders. Use 'Delete anyway' to remove it." };
  }

  // CouponUsage rows cascade on delete; Order.couponId is a denormalized snapshot.
  await prisma.coupon.delete({ where: { id } });
  revalidatePath("/admin/coupons");
  return { ok: true, message: "Coupon deleted." };
}
