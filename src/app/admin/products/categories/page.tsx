import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { getAdminCategories } from "@/lib/admin-catalog";
import { CategoryForm } from "@/components/admin/catalog/CategoryForm";
import type { CategoryProp } from "./types";

export const metadata: Metadata = { title: "Categories | KeebForge Admin", robots: { index: false, follow: false } };

export default async function AdminCategoriesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  await requirePermission("product", "create");
  const { edit } = await searchParams;
  const categories = await getAdminCategories();
  const editing = edit ? categories.find((c) => c.id === edit) ?? null : null;
  const topLevel = categories.filter((c) => !c.parentId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Link href="/admin/products" className="muted" style={{ fontSize: "0.75rem" }}>← Products</Link>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>Categories</h1>
        <p className="muted" style={{ marginTop: 2 }}>Database-driven taxonomy with nested categories.</p>
      </div>

      <CategoryForm categories={categories} editing={editing} />

      <div className="admin-card" style={{ padding: 8 }}>
        <div style={{ overflowX: "auto" }}>
          <table className="admin-table">
            <thead><tr><th>Category</th><th>Slug</th><th>Products</th><th>Order</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {topLevel.map((c) => (
                <CategoryRow key={c.id} c={c} childrenCats={categories.filter((x) => x.parentId === c.id)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ c, childrenCats }: { c: CategoryProp; childrenCats: CategoryProp[] }) {
  return (
    <>
      <tr>
        <td style={{ fontWeight: 600 }}>{c.name}</td>
        <td className="muted num">{c.slug}</td>
        <td className="num">{c._count.products}</td>
        <td className="num">{c.sortOrder}</td>
        <td><span className={`badge ${c.active ? "badge-ok" : "badge-err"}`}>{c.active ? "Active" : "Hidden"}</span></td>
        <td><Link href={`/admin/products/categories?edit=${c.id}`} className="btn-admin sm">Edit</Link></td>
      </tr>
      {childrenCats.map((sub) => (
        <tr key={sub.id}>
          <td style={{ paddingLeft: 28, color: "var(--t2)" }}>↳ {sub.name}</td>
          <td className="muted num">{sub.slug}</td>
          <td className="num">{sub._count.products}</td>
          <td className="num">{sub.sortOrder}</td>
          <td><span className={`badge ${sub.active ? "badge-ok" : "badge-err"}`}>{sub.active ? "Active" : "Hidden"}</span></td>
          <td><Link href={`/admin/products/categories?edit=${sub.id}`} className="btn-admin sm">Edit</Link></td>
        </tr>
      ))}
    </>
  );
}