import { NextResponse } from "next/server";
import { getCurrentAuth } from "@/lib/auth";
import { getCartWithItems } from "@/lib/cart";
import { loadActiveModConfigs } from "@/lib/mods/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, profile } = await getCurrentAuth();
    const cart = await getCartWithItems();
    if (!cart) {
      return NextResponse.json({ items: [], user: null, serviceItem: null, serviceServices: [] });
    }

    // Resolve the stashed configuration against live services (active only)
    // so checkout can render a preview without a second round-trip.
    const svcConfig = cart.serviceItem
      ? (cart.serviceItem.config as { serviceIds?: string[] } | null)
      : null;
    const serviceServices = svcConfig?.serviceIds
      ? await loadActiveModConfigs([...new Set(svcConfig.serviceIds)])
      : [];

    return NextResponse.json({
      items: cart.items,
      user: user ? { name: profile?.name, email: user.email, phone: profile?.phone } : null,
      serviceItem: cart.serviceItem?.config ?? null,
      serviceServices,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch cart" }, { status: 500 });
  }
}
/** Clears all product line items (after a successful payment). */
export async function DELETE() {
  try {
    const cart = await getCartWithItems();
    if (!cart) return NextResponse.json({ ok: true });
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to clear cart" }, { status: 500 });
  }
}
