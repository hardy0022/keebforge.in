"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import {
  availableQuantity,
  cartForCurrentUser,
  CART_COOKIE,
} from "@/lib/cart";
import { configKey, configSnapshot, resolveConfiguredPrice, type ProductConfigSnapshot } from "@/lib/product-options";

const optionIdsSchema = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    try {
      const arr = JSON.parse(v);
      if (Array.isArray(arr) && arr.length > 0 && arr.length <= 10 && arr.every((x) => typeof x === "string")) return arr as string[];
    } catch {
      /* fallthrough */
    }
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid configuration." });
    return z.NEVER;
  });

const addSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.coerce.number().int().min(1).max(50),
  optionIds: optionIdsSchema,
});

const qtySchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(50),
});

export type CartActionState = { ok?: boolean; error?: string; count?: number };

/** Server-side validation of quantity against live stock. Returns error or ok. */
async function quantityCheck(productId: string, variantId: string | null, quantity: number) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { variants: { where: { active: true } } },
  });
  if (!product || !product.active) return "This product is no longer available.";

  // Custom orders are built on demand — inventory doesn't gate ordering.
  if (product.productType === "CUSTOM") {
    if (product.status === "OUT_OF_STOCK") return "This product is not accepting orders right now.";
    if (variantId && !product.variants.some((v) => v.id === variantId)) return "This variant is not available.";
    return null;
  }

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
    optionIds: formData.get("optionIds"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid request." };

  const { productId, variantId, quantity, optionIds } = parsed.data;
  if (variantId && optionIds) return { error: "Choose either a variant or options, not both." };

  // Configurable products: resolve price + selections from live DB data.
  let config: ProductConfigSnapshot | null = null;
  if (optionIds) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: {
        optionGroups: {
          where: { enabled: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: { options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
        },
      },
    });
    if (!product || !product.active || product.optionGroups.length === 0) {
      return { error: "This product is no longer available." };
    }
    const resolved = resolveConfiguredPrice(product.optionGroups, product.price, optionIds);
    if (!resolved.ok) return { error: resolved.error };
    config = configSnapshot(resolved);
  }

  const check = await quantityCheck(productId, variantId ?? null, quantity);
  if (check) return { error: check };

  const cart = await cartForCurrentUser();

  // Identical configurations merge into one line; different ones stay separate.
  const candidates = await prisma.cartItem.findMany({
    where: { cartId: cart.id, productId, variantId: variantId ?? null },
  });
  const key = config ? configKey(config.optionIds) : null;
  const existing =
    key === null
      ? candidates.find((c) => !c.config)
      : candidates.find((c) => {
          const cfg = c.config as ProductConfigSnapshot | null;
          return cfg?.kind === "options" && configKey(cfg.optionIds) === key;
        });
  const nextQty = existing ? existing.quantity + quantity : quantity;
  // Re-validate combined quantity against live stock (same item may already be in cart).
  const checkAgain = await quantityCheck(productId, variantId ?? null, nextQty);
  if (checkAgain) return { error: checkAgain };

  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: nextQty } });
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId, variantId: variantId ?? null, quantity, ...(config ? { config } : {}) },
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

/** Removes the stashed service job from the caller's cart (cart page button). */
export async function removeServiceFromCart(): Promise<void> {
  const owner = await resolveOwnerForRead();
  if (!owner) return;
  const cart = await prisma.cart.findFirst({ where: owner, select: { id: true } });
  if (!cart) return;
  await prisma.cartServiceItem.deleteMany({ where: { cartId: cart.id } });
  revalidatePath("/cart");
}

function resolveOwnerForRead(): Promise<{ profileId: string } | { guestToken: string } | null> {
  return (async () => {
    const { user, profile } = await getCurrentAuth();
    if (user && profile) return { profileId: profile.id };
    const token = (await cookies()).get(CART_COOKIE)?.value;
    return token ? { guestToken: token } : null;
  })();
}