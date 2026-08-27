import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { ImportForm } from "@/components/admin/catalog/ImportForm";

export const metadata: Metadata = { title: "Import Products | KeebForge Admin", robots: { index: false, follow: false } };

export default async function AdminImportPage() {
  await requirePermission("product", "create");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href="/admin/products" className="muted" style={{ fontSize: "0.75rem" }}>← Products</Link>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>Import products</h1>
        <p className="muted" style={{ marginTop: 2 }}>
          Upload a CSV matching the <Link href="/admin/products/export" className="acc">export format</Link>. Rows with an existing slug or a missing category are skipped.
        </p>
      </div>
      <ImportForm />
    </div>
  );
}