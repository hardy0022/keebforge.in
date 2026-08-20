import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getAdminBrands } from "@/lib/admin-catalog";
import { BrandForm } from "@/components/admin/catalog/BrandForm";

export const metadata: Metadata = { title: "Brands | KeebForge Admin", robots: { index: false, follow: false } };

export default async function AdminBrandsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requireAdmin();
  const { edit } = await searchParams;
  const brands = await getAdminBrands();
  const editing = edit ? brands.find((b) => b.id === edit) ?? null : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href="/admin/products" className="muted" style={{ fontSize: "0.75rem" }}>← Products</Link>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>Brands</h1>
        <p className="muted" style={{ marginTop: 2 }}>Reusable brand catalogue — products reference brands here.</p>
      </div>

      <BrandForm editing={editing} />

      <div className="admin-card" style={{ padding: 8 }}>
        {brands.length === 0 ? (
          <div className="empty"><b>No brands yet</b></div>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Brand</th><th>Slug</th><th>Products</th><th>Website</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {brands.map((b) => (
                <tr key={b.id}>
                  <td style={{ fontWeight: 600 }}>
                    {b.logoUrl ? <Image src={b.logoUrl} alt={b.name} width={24} height={24} style={{ borderRadius: 6, verticalAlign: "middle", marginRight: 8 }} /> : null}
                    {b.name}
                  </td>
                  <td className="muted num">{b.slug}</td>
                  <td className="num">{b._count.products}</td>
                  <td className="muted">{b.website ?? "—"}</td>
                  <td><span className={`badge ${b.active ? "badge-ok" : "badge-err"}`}>{b.active ? "Active" : "Hidden"}</span></td>
                  <td><Link href={`/admin/brands?edit=${b.id}`} className="btn-admin sm">Edit</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}