"use client";

import { ActionForm, Spinner } from "@/components/admin/ActionForm";
import { saveCategory } from "@/app/admin/actions/catalog";
import type { CategoryProp } from "@/app/admin/products/categories/types";

export function CategoryForm({ categories, editing }: { categories: CategoryProp[]; editing: CategoryProp | null }) {
  const parents = categories.filter((c) => !c.parentId);
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ marginBottom: 0 }}>{editing ? `Edit category: ${editing.name}` : "Add category"}</h3>
      <ActionForm action={saveCategory} toastLabel="Category">
        {(pending) => (
          <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input className="input" name="name" placeholder="Name (e.g. Mechanical Keyboards)" defaultValue={editing?.name ?? ""} required disabled={pending} />
            <input className="input" name="slug" placeholder="Slug (blank = auto)" defaultValue={editing?.slug ?? ""} disabled={pending} />
            <select className="select" name="parentId" defaultValue={editing?.parentId ?? ""} disabled={pending}>
              <option value="">Top-level</option>
              {parents.filter((p) => p.id !== editing?.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <input className="input" type="number" name="sortOrder" placeholder="Sort order" defaultValue={editing?.sortOrder ?? 0} disabled={pending} />
            <input className="input" name="image" placeholder="Image URL (optional)" defaultValue={editing?.image ?? ""} style={{ gridColumn: "1 / -1" }} disabled={pending} />
            <input className="input" name="description" placeholder="Description (optional)" defaultValue={editing?.description ?? ""} style={{ gridColumn: "1 / -1" }} disabled={pending} />
            <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
              <input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} disabled={pending} /> Active
            </label>
            <div className="admin-actions">
              <button type="submit" className="btn-admin primary" disabled={pending}>{pending ? <Spinner /> : editing ? "Save changes" : "Add category"}</button>
            </div>
          </div>
        )}
      </ActionForm>
    </div>
  );
}