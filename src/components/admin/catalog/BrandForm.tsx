"use client";

import { ActionForm, Spinner } from "@/components/admin/ActionForm";
import { saveBrand } from "@/app/admin/actions/catalog";

export type BrandProp = { id: string; name: string; slug: string; logoUrl: string | null; description: string | null; website: string | null; seoTitle: string | null; seoDescription: string | null; active: boolean; _count: { products: number } };

export function BrandForm({ editing }: { editing: BrandProp | null }) {
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ marginBottom: 0 }}>{editing ? `Edit brand: ${editing.name}` : "Add brand"}</h3>
      <ActionForm action={saveBrand} toastLabel="Brand">
        {(pending) => (
          <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <input className="input" name="name" placeholder="Brand name" defaultValue={editing?.name ?? ""} required disabled={pending} />
            <input className="input" name="slug" placeholder="Slug (blank = auto)" defaultValue={editing?.slug ?? ""} disabled={pending} />
            <input className="input" name="logoUrl" placeholder="Logo URL" defaultValue={editing?.logoUrl ?? ""} disabled={pending} />
            <input className="input" name="website" placeholder="Website" defaultValue={editing?.website ?? ""} disabled={pending} />
            <input className="input" name="seoTitle" placeholder="SEO title" defaultValue={editing?.seoTitle ?? ""} style={{ gridColumn: "1 / -1" }} disabled={pending} />
            <input className="input" name="seoDescription" placeholder="SEO description" defaultValue={editing?.seoDescription ?? ""} style={{ gridColumn: "1 / -1" }} disabled={pending} />
            <textarea className="textarea" name="description" placeholder="Description (optional)" defaultValue={editing?.description ?? ""} style={{ gridColumn: "1 / -1", minHeight: 60 }} disabled={pending} />
            <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
              <input type="checkbox" name="active" defaultChecked={editing ? editing.active : true} disabled={pending} /> Active
            </label>
            <div className="admin-actions">
              <button type="submit" className="btn-admin primary" disabled={pending}>{pending ? <Spinner /> : editing ? "Save changes" : "Add brand"}</button>
            </div>
          </div>
        )}
      </ActionForm>
    </div>
  );
}