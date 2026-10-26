import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { cartOwnerWhere, resolveCartOwner } from "@/lib/cart";

export const dynamic = "force-dynamic";

/** Removes the stashed service job (e.g. after its order has been created). */
export async function DELETE() {
  try {
    const owner = await resolveCartOwner();
    if (!owner) return NextResponse.json({ ok: true });

    const cart = await prisma.cart.findFirst({
      where: cartOwnerWhere(owner),
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
