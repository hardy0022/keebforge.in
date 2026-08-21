"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import { availableQuantity, CART_COOKIE, CART_MAX_AGE } from "@/lib/cart";

const addSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.coerce.number().int().min(1).max(50),
});

const qtySchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(50),
});

export type CartActionState = { ok?: boolean; error?: string; count?: number };

async function cartForCurrentUser() {
  const { user, profile } = await getCurrentAuth();
  const cookieStore = await cookies();

  if (user && profile) {
    return prisma.cart.upsert({ where: { profileId: profile.id }, update: {}, create: { profileId: profile.id } });
  }

  let token = cookieStore.get(CART_COOKIE)?.value;
  if (!token) {
    token = randomUUID();
    cookieStore.set(CART_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CART_MAX_AGE,
    });
  }
  return prisma.cart.upsert({ where: { guestToken: token }, update: {}, create: { guestToken: token } });
}

/** Server-side validation of quantity against live stock. Returns error or ok. */
async function quantityCheck(productId: string, variantId: string | null, quantity: number) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { where: { active: true } } },
  });
  if (!product || !product.active) return "This product is no longer available.";

  if (variantId) {
    const variant = product.variants.find((v) => v.id === variantId);
    if (!variant) return "This variant is not available.";
    const avail = availableQuantity(variant.stock, variant.reservedQuantity);
    if (avail <= 0) return "This variant is out of stock.";
    if (quantity > avail) return `Only ${avail} available.`;
  } else {
    const avail = availableQuantity(product.stock, product.reservedQuantity);
    if (avail <= 0) return "This product is out of stock.";
    if (quantity > avail) return `Only ${avail} available.`;
  }
  return null;
}

export async function addToCart(_prev: CartActionState | null, formData: FormData): Promise<CartActionState> {
  const parsed = addSchema.safeParse({
    productId: formData.get("productId"),
    variantId: formData.get("variantId") || undefined,
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request." };

  const { productId, variantId, quantity } = parsed.data;
  const check = await quantityCheck(productId, variantId ?? null, quantity);
  if (check) return { error: check };

  const cart = await cartForCurrentUser();

  const existing = await prisma.cartItem.findFirst({
    where: { cartId: cart.id, productId, variantId: variantId ?? null },
  });
  const nextQty = existing ? existing.quantity + quantity : quantity;
  // Re-validate combined quantity against live stock (same item may already be in cart).
  const checkAgain = await quantityCheck(productId, variantId ?? null, nextQty);
  if (checkAgain) return { error: checkAgain };

  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQty } });
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, variantId: variantId ?? null, quantity },
    });
  }

  const count = await prisma.cartItem.aggregate({ where: { cartId: cart.id }, _sum: { quantity: true } });
  revalidatePath("/cart");
  return { ok: true, count: count._sum.quantity ?? 0 };
}

export async function updateCartItem(_prev: CartActionState | null, formData: FormData): Promise<CartActionState> {
  const parsed = qtySchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const { user, profile } = await getCurrentAuth();
  if (!user || !profile) {
    const owner = (await cookies()).get(CART_COOKIE)?.value;
    if (!owner) return { error: "Your cart is empty." };
  }

  const item = await prisma.cartItem.findUnique({
    where: { id: parsed.data.itemId },
    include: { product: true, variant: true },
  });
  if (!item) return { error: "Item not found in your cart." };

  const check = await quantityCheck(item.productId, item.variantId, parsed.data.quantity);
  if (check) return { error: check };

  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: parsed.data.quantity } });
  revalidatePath("/cart");
  return { ok: true };
}

export async function removeCartItem(formData: FormData): Promise<void> {
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string") return;

  const { user, profile } = await getCurrentAuth();
  let ownerWhere: { profileId: string } | { guestToken: string } | null = null;
  if (user && profile) {
    ownerWhere = { profileId: profile.id };
  } else {
    const token = (await cookies()).get(CART_COOKIE)?.value;
    if (token) ownerWhere = { guestToken: token };
  }
  if (!ownerWhere) return;

  const cart = await prisma.cart.findFirst({ where: ownerWhere, select: { id: true } });
  if (!cart) return;
  await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
  revalidatePath("/cart");
}