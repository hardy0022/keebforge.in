import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { getAdminCategories } from "@/lib/admin-catalog";
import { CategoryForm } from "@/components/admin/catalog/CategoryForm";

export const metadata: Metadata = { title: "Categories | KeebForge Admin", robots: { index: false, follow: false } };

export default async function AdminSettingsCategoriesPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  await requirePermission("setting", "view");
  const { cat: editCatId } = await searchParams;
  const categories = await getAdminCategories();
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
  const editingCategory = editCatId ? (categories.find((c) => c.id === editCatId) ?? null) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href="/admin/settings" className="muted" style={{ fontSize: "0.75rem" }}>← Settings</Link>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>Categories</h1>
      </div>

      <CategoryForm editing={editingCategory} />

      <div className="admin-card" style={{ padding: 8 }}>
        {sorted.length === 0 ? (
          <div className="empty"><b>No categories yet</b></div>
        ) : (
          <table className="admin-table">
            <thead><tr><th>Name</th><th>Slug</th><th></th></tr></thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600 }}>{c.name}</td>
                  <td className="muted num">{c.slug}</td>
                  <td><Link href={editingCategory?.id === c.id ? "/admin/settings/categories" : `/admin/settings/categories?cat=${c.id}`} className="btn-admin sm">{editingCategory?.id === c.id ? "Done editing" : "Edit"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
