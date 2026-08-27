import "server-only";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";

export const CART_COOKIE = "kf_cart";
export const CART_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export type CartOwner = { kind: "profile"; profileId: string } | { kind: "guest"; guestToken: string };

/**
 * Resolves who owns the cart: the signed-in profile, or the guest token
 * cookie (created on first add-to-cart). Server-side only.
 */
export async function resolveCartOwner(): Promise<CartOwner | null> {
  const { user, profile } = await getCurrentAuth();
  if (user && profile) return { kind: "profile", profileId: profile.id };
  const token = (await cookies()).get(CART_COOKIE)?.value;
  return token ? { kind: "guest", guestToken: token } : null;
}

export function cartOwnerWhere(owner: CartOwner) {
  return owner.kind === "profile" ? { profileId: owner.profileId } : { guestToken: owner.guestToken };
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

const cartInclude = {
  items: {
    include: {
      product: {
        include: {
          brand: true,
          images: { where: { active: true }, orderBy: [{ primary: "desc" }, { sortOrder: "asc" }], take: 1 },
          optionGroups: {
            where: { enabled: true },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: { options: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] } },
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
