"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import {
  availableQuantity,
  cartForCurrentUser,
  cartOwnerWhere,
  resolveCartOwner,
} from "@/lib/cart";
import {
  configKey,
  configSnapshot,
  resolveConfiguredPrice,
  type ProductConfigSnapshot,
} from "@/lib/catalog/product-options";

const optionIdsSchema = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    try {
      const arr = JSON.parse(v);
      if (
        Array.isArray(arr) &&
        arr.length > 0 &&
        arr.length <= 10 &&
        arr.every((x) => typeof x === "string")
      )
        return arr as string[];
    } catch {
      /* fallthrough */
    }
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid configuration.",
    });
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

export type CartActionState = {
  ok?: boolean;
  error?: string;
  count?: number;
  quantity?: number;
  available?: number;
};

/**
 * Server-side validation of quantity against live stock, performed in-memory
 * on an already-loaded product (narrow select). Returns error string or null.
 */
function checkQuantity(
  product: {
    active: boolean;
    status: string;
    productType: string;
    stock: number;
    reservedQuantity: number;
    variants: {
      id: string;
      active: boolean;
      stock: number;
      reservedQuantity: number;
    }[];
  },
  variantId: string | null,
  quantity: number,
): string | null {
  if (!product.active) return "This product is no longer available.";

  // Custom orders are built on demand — inventory doesn't gate ordering.
  if (product.productType === "CUSTOM") {
    if (product.status === "OUT_OF_STOCK")
      return "This product is not accepting orders right now.";
    if (variantId && !product.variants.some((v) => v.id === variantId))
      return "This variant is not available.";
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

export async function addToCart(
  _prev: CartActionState | null,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = addSchema.safeParse({
    productId: formData.get("productId"),
    variantId: formData.get("variantId") || undefined,
    quantity: formData.get("quantity"),
    optionIds: formData.get("optionIds"),
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };

  const { productId, variantId, quantity, optionIds } = parsed.data;
  if (variantId && optionIds)
    return { error: "Choose either a variant or options, not both." };

  // Single narrow load carries everything addToCart needs: active/status/type for
  // gating, product + variant stock for availability, and config options when set.
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      active: true,
      status: true,
      productType: true,
      price: true,
      stock: true,
      reservedQuantity: true,
      variants: {
        where: { active: true },
        select: {
          id: true,
          active: true,
          stock: true,
          reservedQuantity: true,
        },
      },
      optionGroups: {
        where: { enabled: true },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          required: true,
          enabled: true,
          options: {
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              priceAddon: true,
              enabled: true,
            },
          },
        },
      },
    },
  });
  if (!product || !product.active)
    return { error: "This product is no longer available." };
  const madeToOrder = product.productType === "CUSTOM";
  const qty = madeToOrder ? 1 : quantity;

  // Configurable products: resolve price + selections from live DB data.
  let config: ProductConfigSnapshot | null = null;
  if (optionIds) {
    if (product.optionGroups.length === 0) {
      return { error: "This product is no longer available." };
    }
    const resolved = resolveConfiguredPrice(
      product.optionGroups,
      product.price,
      optionIds,
    );
    if (!resolved.ok) return { error: resolved.error };
    config = configSnapshot(resolved);
  }

  const check = checkQuantity(product, variantId ?? null, qty);
  if (check) return { error: check };

  const cart = await cartForCurrentUser();

  // Identical configurations merge into one line; different ones stay separate.
  // Made-to-order units never merge — each build is its own quantity-1 line.
  const candidates = await prisma.cartItem.findMany({
    where: { cartId: cart.id, productId, variantId: variantId ?? null },
    select: { id: true, quantity: true, config: true },
  });
  const key = config ? configKey(config.optionIds) : null;
  const existing = madeToOrder
    ? undefined
    : key === null
      ? candidates.find((c) => !c.config)
      : candidates.find((c) => {
          const cfg = c.config as ProductConfigSnapshot | null;
          return cfg?.kind === "options" && configKey(cfg.optionIds) === key;
        });
  const nextQty = existing ? existing.quantity + qty : qty;
  // Re-validate combined quantity against live stock (same item may already be in cart).
  const checkAgain = checkQuantity(product, variantId ?? null, nextQty);
  if (checkAgain) return { error: checkAgain };

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: nextQty },
    });
  } else {
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        variantId: variantId ?? null,
        quantity: qty,
        ...(config ? { config } : {}),
      },
    });
  }

  const count = await prisma.cartItem.aggregate({
    where: { cartId: cart.id },
    _sum: { quantity: true },
  });
  return { ok: true, count: count._sum.quantity ?? 0 };
}

export async function updateCartItem(
  _prev: CartActionState | null,
  formData: FormData,
): Promise<CartActionState> {
  const parsed = qtySchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return { error: "Invalid request." };
  const { itemId, quantity } = parsed.data;

  const owner = await resolveCartOwner();
  if (!owner) return { error: "Your cart is empty." };

  // Ownership-scoped load of only what inventory validation needs (no heavy
  // includes, no separate availability query — stock comes back in one call).
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cart: cartOwnerWhere(owner) },
    select: {
      id: true,
      quantity: true,
      productId: true,
      variantId: true,
      product: {
        select: {
          active: true,
          productType: true,
          status: true,
          stock: true,
          reservedQuantity: true,
        },
      },
      variant: {
        select: { active: true, stock: true, reservedQuantity: true },
      },
    },
  });
  if (!item) return { error: "Item not found in your cart." };

  const avail = item.product.productType === "CUSTOM"
    ? quantity
    : item.variant
      ? availableQuantity(item.variant.stock, item.variant.reservedQuantity)
      : availableQuantity(item.product.stock, item.product.reservedQuantity);
  if (avail <= 0) return { error: "This product is out of stock." };
  if (quantity > avail) return { error: `Only ${avail} available.` };

  await prisma.cartItem.updateMany({
    where: { id: itemId, cart: cartOwnerWhere(owner) },
    data: { quantity },
  });
  return { ok: true, quantity, available: avail };
}

export async function removeCartItem(
  formData: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const itemId = formData.get("itemId");
  if (typeof itemId !== "string" || !itemId) return { ok: true };

  const owner = await resolveCartOwner();
  if (!owner) return { error: "Your cart is empty." };

  // Ownership-scoped atomic delete — no separate cart lookup needed.
  await prisma.cartItem.deleteMany({
    where: { id: itemId, cart: cartOwnerWhere(owner) },
  });
  return { ok: true };
}
