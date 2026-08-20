import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getAdminProduct, getAdminCategories, getAdminBrands } from "@/lib/admin-catalog";
import { ProductForm } from "@/components/admin/products/ProductForm";

export const metadata: Metadata = { title: "Edit Product | KeebForge Admin", robots: { index: false, follow: false } };

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const [product, categories, brands] = await Promise.all([getAdminProduct(id), getAdminCategories(), getAdminBrands()]);
  if (!product) notFound();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href={`/admin/products/${id}`} className="muted" style={{ fontSize: "0.75rem" }}>← {product.name}</Link>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>Edit Product</h1>
      </div>
      <ProductForm product={product as never} categories={categories} brands={brands} />
    </div>
  );
}