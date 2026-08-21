import Link from "next/link";
import type { Metadata } from "next";
import { ServiceUnit } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ServicePriceForm } from "@/components/admin/services/ServicePriceForm";

export const metadata: Metadata = { title: "Services | KeebForge Admin", robots: { index: false, follow: false } };

type Sort = "order" | "name" | "price-asc" | "price-desc";

const SORTS: [Sort, string][] = [
  ["order", "Custom order"],
  ["name", "Name (A–Z)"],
  ["price-asc", "Price (low → high)"],
  ["price-desc", "Price (high → low)"],
];

const effPrice = (svc: { price: number | null; priceMin: number | null }) => svc.price ?? svc.priceMin ?? Infinity;

function sortServices<T extends { name: string; sortOrder: number; price: number | null; priceMin: number | null }>(
  services: T[],
  sort: Sort
): T[] {
  const arr = [...services];
  if (sort === "name") return arr.sort((a, b) => a.name.localeCompare(b.name));
  if (sort === "price-asc") return arr.sort((a, b) => effPrice(a) - effPrice(b));
  if (sort === "price-desc") return arr.sort((a, b) => effPrice(b) - effPrice(a));
  return arr.sort((a, b) => a.sortOrder - b.sortOrder);
}

export default async function AdminServicesPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  await requireAdmin();
  const { sort = "order" } = await searchParams;
  const sortKey: Sort = (["order", "name", "price-asc", "price-desc"] as const).includes(sort as Sort)
    ? (sort as Sort)
    : "order";
  const groups = await prisma.serviceGroup.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }],
    include: { services: { orderBy: [{ sortOrder: "asc" }] } },
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href="/admin" className="muted" style={{ fontSize: "0.75rem" }}>← Dashboard</Link>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>Services & Pricing</h1>
        <p className="muted" style={{ marginTop: 2 }}>
          Set the price for each service — this feeds the public configurator on /services. Prices are stored as integer paise (₹12 = 1200).
        </p>
      </div>

      <form method="get" style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label className="form-row" style={{ marginBottom: 0, gap: 5, flexDirection: "row", alignItems: "center" }}>
          <span className="admin-label">Sort by</span>
          <select className="input" name="sort" defaultValue={sortKey} style={{ width: "auto" }}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn-admin sm">Apply</button>
      </form>

      {groups.map((g) => (
        <section key={g.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--t3)" }}>
            {g.device === "MOUSE" ? "🖱️" : "⌨️"} {g.name}
          </h2>
          {sortServices(g.services, sortKey).map((svc) => (
            <ServicePriceForm
              key={svc.id}
              svc={{
                id: svc.id,
                slug: svc.slug,
                name: svc.name,
                description: svc.description,
                unit: svc.unit as ServiceUnit,
                price: svc.price,
                priceMin: svc.priceMin,
                priceMax: svc.priceMax,
                priceLabel: svc.priceLabel,
                combo: svc.combo,
                popular: svc.popular,
                highlight: svc.highlight,
                active: svc.active,
                sortOrder: svc.sortOrder,
              }}
            />
          ))}
        </section>
      ))}
    </div>
  );
}