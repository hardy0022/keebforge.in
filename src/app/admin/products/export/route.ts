import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  await requireAdmin();
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    select: {
      name: true,
      slug: true,
      type: true,
      status: true,
      sku: true,
      barcode: true,
      price: true,
      compareAtPrice: true,
      costPrice: true,
      stock: true,
      lowStockThreshold: true,
      gstRate: true,
      featured: true,
      category: { select: { slug: true } },
      brand: { select: { slug: true } },
    },
  });

  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["name", "slug", "type", "status", "category", "brand", "sku", "barcode", "price", "compareAtPrice", "costPrice", "stock", "lowStockThreshold", "gstRate", "featured"];
  const lines = [
    header.join(","),
    ...products.map((p) =>
      [p.name, p.slug, p.type, p.status, p.category.slug, p.brand?.slug ?? "", p.sku ?? "", p.barcode ?? "", (p.price / 100).toFixed(2), p.compareAtPrice ? (p.compareAtPrice / 100).toFixed(2) : "", p.costPrice ? (p.costPrice / 100).toFixed(2) : "", p.stock, p.lowStockThreshold, p.gstRate, p.featured ? "1" : "0"].map(esc).join(",")
    ),
  ];

  return new NextResponse("\uFEFF" + lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keebforge-products-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}