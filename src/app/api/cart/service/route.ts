import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAuth } from "@/lib/auth/session";
import { CART_COOKIE } from "@/lib/cart";

export const dynamic = "force-dynamic";

/** Removes the stashed service job (e.g. after its order has been created). */
export async function DELETE() {
  try {
    const { user, profile } = await getCurrentAuth();
    let ownerWhere: { profileId: string } | { guestToken: string } | null =
      null;
    if (user && profile) {
      ownerWhere = { profileId: profile.id };
    } else {
      const token = (await cookies()).get(CART_COOKIE)?.value;
      if (token) ownerWhere = { guestToken: token };
    }
    if (!ownerWhere) return NextResponse.json({ ok: true });

    const cart = await prisma.cart.findFirst({
      where: ownerWhere,
      select: { id: true },
    });
    if (cart) {
      await prisma.cartServiceItem.deleteMany({ where: { cartId: cart.id } });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to update cart" },
      { status: 500 },
    );
  }
}
