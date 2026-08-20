import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAdminCategories, getAdminBrands } from "@/lib/admin-catalog";
import { ProductForm } from "@/components/admin/products/ProductForm";

export const metadata: Metadata = { title: "New Product | KeebForge Admin", robots: { index: false, follow: false } };

export default async function NewProductPage() {
  await requireAdmin();
  const [categories, brands] = await Promise.all([getAdminCategories(), getAdminBrands()]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href="/admin/products" className="muted" style={{ fontSize: "0.75rem" }}>← Products</Link>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>New Product</h1>
        <p className="muted" style={{ marginTop: 2 }}>Create a new product for the KeebForge shop.</p>
      </div>
      <ProductForm product={null} categories={categories} brands={brands} />
    </div>
  );
}