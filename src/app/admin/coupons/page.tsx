import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { prisma } from "@/lib/prisma";
import { CouponsManager } from "./CouponsManager";

export const metadata: Metadata = { title: "Coupons | KeebForge Admin", robots: { index: false, follow: false } };

export default async function AdminCouponsPage() {
  await requirePermission("coupon", "view");

  const coupons = await prisma.coupon.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      type: true,
      value: true,
      minOrder: true,
      maxDiscount: true,
      active: true,
      usageLimit: true,
      usedCount: true,
      perCustomerLimit: true,
      startsAt: true,
      expiresAt: true,
      createdAt: true,
      _count: { select: { usages: true } },
    },
  });

  const serialized = coupons.map((c) => ({
    ...c,
    startsAt: c.startsAt?.toISOString() ?? null,
    expiresAt: c.expiresAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 980 }}>
      <div>
        <div className="admin-label" style={{ marginBottom: 6 }}>Promotions</div>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Coupons
        </h1>
        <p className="muted" style={{ marginTop: 2 }}>
          Create discount codes applied at checkout. Percent values are whole numbers; fixed values are in ₹.
        </p>
      </div>
      <CouponsManager coupons={serialized} />
    </div>
  );
}
