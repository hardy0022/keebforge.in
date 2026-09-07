import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cartOwnerWhere, resolveCartOwner } from "@/lib/cart";

export const dynamic = "force-dynamic";

/**
 * Lightweight cart badge count (sum of quantities) for the site header.
 * Resolving the full cart (getCartWithItems) just to render a "3" badge made
 * every navigation pay ~10 sequential DB round trips. This path is one
 * aggregate query scoped to the same authenticated owner.
 */
export async function GET() {
  try {
    const owner = await resolveCartOwner();
    if (!owner) return NextResponse.json({ count: 0 });
    const agg = await prisma.cartItem.aggregate({
      where: { cart: cartOwnerWhere(owner) },
      _sum: { quantity: true },
    });
    return NextResponse.json({ count: agg._sum.quantity ?? 0 });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
