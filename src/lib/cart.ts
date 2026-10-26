import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@/lib/db/prisma";
import { getCurrentAuth } from "@/lib/auth/session";
import { configKey } from "@/lib/catalog/product-options";
import { MAX_CART_QUANTITY } from "@/lib/utils/limits";

export const CART_COOKIE = "kf_cart";
export const CART_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type CartOwner =
  | { kind: "profile"; profileId: string }
  | { kind: "guest"; guestToken: string };

type MergeItem = {
  id: string;
  quantity: number;
  productId: string;
  variantId: string | null;
  config: Prisma.JsonValue | null;
  addonSelected: boolean;
  colorOptionId: string | null;
  secondaryColorOptionId: string | null;
  product: { productType: string };
};

/**
 * Stable identity for a cart line. Two lines merge only when the product,
 * variant, canonical option set, add-on and both colour choices all match —
 * different configurations must remain separate. Made-to-order units are
 * excluded by the caller because every build is its own quantity-1 line.
 */
function cartLineKey(item: MergeItem): string {
  const cfg = item.config as { kind?: string; optionIds?: unknown } | null;
  const options =
    cfg?.kind === "options" && Array.isArray(cfg.optionIds)
      ? configKey(cfg.optionIds.filter((v): v is string => typeof v === "string"))
      : "";
  return JSON.stringify([
    item.productId,
    item.variantId,
    options,
    item.addonSelected,
    item.colorOptionId,
    item.secondaryColorOptionId,
  ]);
}

const mergeItemSelect = {
  id: true,
  quantity: true,
  productId: true,
  variantId: true,
  config: true,
  addonSelected: true,
  colorOptionId: true,
  secondaryColorOptionId: true,
  product: { select: { productType: true } },
} satisfies Prisma.CartItemSelect;

/**
 * Move a browser's guest cart onto the signed-in profile's cart.
 *
 * Identity is content-based: identical configurations combine quantities
 * (capped at the same per-line maximum as add-to-cart), while different
 * option/colour/add-on selections remain distinct lines. Made-to-order lines
 * are always moved as-is. An exclusive service job is copied only when the
 * profile has none, so an existing signed-in cart is never overwritten.
 *
 * The guest cart is claimed with an atomic guestToken clear before any rows
 * move. Concurrent requests therefore cannot merge the same guest cart twice:
 * the loser matches zero rows and exits. A failure rolls the transaction back,
 * leaving the guest cart intact for the next request.
 */
export async function mergeGuestCartIntoProfile(
  profileId: string,
  guestToken: string,
): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const guest = await tx.cart.findFirst({
        where: { guestToken, profileId: null },
        select: {
          id: true,
          items: { select: mergeItemSelect },
          serviceItem: { select: { config: true } },
        },
      });
      if (!guest) return;

      const profileCart = await tx.cart.upsert({
        where: { profileId },
        update: {},
        create: { profileId },
      });
      if (guest.id === profileCart.id) return;

      const claimed = await tx.cart.updateMany({
        where: { id: guest.id, guestToken, profileId: null },
        data: { guestToken: null },
      });
      if (claimed.count === 0) return;

      const existing = await tx.cartItem.findMany({
        where: { cartId: profileCart.id },
        select: mergeItemSelect,
      });
      const byKey = new Map(existing.map((item) => [cartLineKey(item), item]));

      for (const item of guest.items) {
        if (item.product.productType !== "CUSTOM") {
          const match = byKey.get(cartLineKey(item));
          if (match) {
            const quantity = Math.min(
              MAX_CART_QUANTITY,
              match.quantity + item.quantity,
            );
            await tx.cartItem.update({
              where: { id: match.id },
              data: { quantity },
            });
            match.quantity = quantity;
            await tx.cartItem.delete({ where: { id: item.id } });
            continue;
          }
        }

        await tx.cartItem.update({
          where: { id: item.id },
          data: { cartId: profileCart.id },
        });
        if (item.product.productType !== "CUSTOM") {
          byKey.set(cartLineKey(item), item);
        }
      }

      if (guest.serviceItem) {
        await tx.cartServiceItem.upsert({
          where: { cartId: profileCart.id },
          update: {},
          create: {
            cartId: profileCart.id,
            config: guest.serviceItem.config as Prisma.InputJsonValue,
          },
        });
      }

      await tx.cart.delete({ where: { id: guest.id } });
    });
  } catch (e) {
    // Cart reads must still succeed when a maintenance merge fails. The guest
    // cart remains untouched, so the next authenticated cart request retries.
    console.error("[cart] guest cart merge failed:", e);
  }
}

/**
 * Resolves who owns the cart: the signed-in profile, or the guest token
 * cookie (created on first add-to-cart). Server-side only.
 */
export async function resolveCartOwner(): Promise<CartOwner | null> {
  const { user, profile } = await getCurrentAuth();
  const token = (await cookies()).get(CART_COOKIE)?.value;
  if (user && profile) {
    if (token) await mergeGuestCartIntoProfile(profile.id, token);
    return { kind: "profile", profileId: profile.id };
  }
  return token ? { kind: "guest", guestToken: token } : null;
}

export function cartOwnerWhere(owner: CartOwner) {
  return owner.kind === "profile"
    ? { profileId: owner.profileId }
    : { guestToken: owner.guestToken };
}

/** Available quantity (stock minus reservations) for a product or variant. */
export function availableQuantity(stock: number, reserved: number): number {
  return Math.max(0, stock - reserved);
}

/**
 * Returns the caller's cart, creating it if needed (and issuing the guest
 * token cookie for anonymous visitors). Usable from server actions and
 * route handlers.
 */
export async function cartForCurrentUser() {
  const { user, profile } = await getCurrentAuth();
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(CART_COOKIE)?.value;

  if (user && profile) {
    if (existingToken)
      await mergeGuestCartIntoProfile(profile.id, existingToken);
    return prisma.cart.upsert({
      where: { profileId: profile.id },
      update: {},
      create: { profileId: profile.id },
    });
  }

  let token = existingToken;
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
  return prisma.cart.upsert({
    where: { guestToken: token },
    update: {},
    create: { guestToken: token },
  });
}

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          brand: true,
          images: {
            where: { active: true },
            orderBy: [{ primary: "desc" }, { sortOrder: "asc" }],
            take: 1,
          },
          optionGroups: {
            where: { enabled: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: {
              options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
            },
          },
        },
      },
      variant: true,
    },
  },
  serviceItem: true,
} satisfies Prisma.CartInclude;

export async function getCartWithItems() {
  const owner = await resolveCartOwner();
  if (!owner) return null;
  return prisma.cart.findFirst({
    where: cartOwnerWhere(owner),
    include: cartInclude,
  });
}

/**
 * Lean cart read for the /shop/cart page render. Unlike getCartWithItems, it:
 *  - uses narrow `select`s (no full Product/Brand/Variant rows, no costPrice,
 *    descriptions, seo, specs, etc. — those are sensitive/unneeded here),
 *  - omits serviceItem entirely (the cart page never renders it),
 *  - keeps only the fields the page needs to render rows + totals.
 * This is display data; price/inventory are still re-validated server-side at
 * checkout (payments/create-order uses getCartWithItems, untouched).
 */
const cartPageSelect = {
  items: {
    select: {
      id: true,
      quantity: true,
      config: true,
      addonSelected: true,
      colorOptionId: true,
      secondaryColorOptionId: true,
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          price: true,
          productType: true,
          stock: true,
          reservedQuantity: true,
          addonEnabled: true,
          addonTitle: true,
          addonDescription: true,
          addonPrice: true,
          secondaryColorHeading: true,
          colorOptions: {
            where: { enabled: true },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: { id: true, name: true, colorCode: true, priceAdjustment: true },
          },
          brand: { select: { name: true } },
          images: {
            where: { active: true },
            orderBy: [{ primary: "desc" }, { sortOrder: "asc" }],
            take: 1,
            select: { url: true, alt: true },
          },
          optionGroups: {
            where: { enabled: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            select: {
              id: true,
              name: true,
              selectionMode: true,
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
      },
      variant: {
        select: {
          id: true,
          name: true,
          price: true,
          stock: true,
          reservedQuantity: true,
        },
      },
      colorOption: {
        select: { id: true, name: true, colorCode: true, priceAdjustment: true },
      },
      secondaryColorOption: {
        select: { id: true, name: true, colorCode: true, priceAdjustment: true },
      },
    },
  },
} satisfies Prisma.CartSelect;

export async function getCartPageView() {
  const owner = await resolveCartOwner();
  if (!owner) return null;
  return prisma.cart.findFirst({
    where: cartOwnerWhere(owner),
    select: cartPageSelect,
  });
}
