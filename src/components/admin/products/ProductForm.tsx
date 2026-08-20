"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveProduct, type CatalogActionState } from "@/app/admin/actions/catalog";
import { PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/product-labels";

type CategoryProp = { id: string; name: string; parentId: string | null };
type BrandProp = { id: string; name: string };
type ImageProp = { url: string; alt: string | null; sortOrder: number; primary: boolean };

type ProductProp = {
  id: string;
  name: string;
  slug: string;
  type: ProductType;
  categoryId: string;
  brandId: string | null;
  shortDescription: string | null;
  description: string | null;
  features: { list?: string[] } | null;
  whatsIncluded: { list?: string[] } | null;
  warrantyInfo: string | null;
  shippingInfo: string | null;
  specifications: Record<string, string> | null;
  price: number;
  compareAtPrice: number | null;
  costPrice: number | null;
  gstRate: number;
  sku: string | null;
  barcode: string | null;
  stock: number;
  lowStockThreshold: number;
  allowBackorders: boolean;
  inventoryTracking: boolean;
  weight: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  shippingClass: string | null;
  freeShipping: boolean;
  shippingRestrictions: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  canonicalUrl: string | null;
  ogImageUrl: string | null;
  featured: boolean;
  popular: boolean;
  isNew: boolean;
  status: "DRAFT" | "ACTIVE" | "OUT_OF_STOCK" | "ARCHIVED";
  images: ImageProp[];
};

const STATUSES = Object.entries(PRODUCT_STATUS_LABELS) as ["DRAFT" | "ACTIVE" | "OUT_OF_STOCK" | "ARCHIVED", string][];
const TYPE_GROUPS = ["KEYBOARD", "MOUSE", "SWITCH", "KEYCAP", "STABILIZER", "PCB", "CASE", "CABLE", "ACCESSORY", "BAREBONES", "PLATE", "SPRING", "SWITCH_FILM", "LUBRICANT", "DESK_MAT", "MOUSE_SWITCH", "MOUSE_SKATE", "ENCODER", "TOOL", "FOAM", "MOD_ACCESSORY", "DIY_KIT"] as const;

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
    <h3 style={{ marginBottom: 0 }}>{title}</h3>
    {children}
  </section>
);

const Field = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <label className="form-row" style={{ marginBottom: 0, gap: 5 }}>
    <span style={{ fontFamily: "var(--ff-display)", fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--t3)" }}>{label}</span>
    {children}
    {hint && <span className="muted" style={{ fontSize: "0.7rem" }}>{hint}</span>}
  </label>
);

export function ProductForm({ product, categories, brands }: { product: ProductProp | null; categories: CategoryProp[]; brands: BrandProp[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CatalogActionState, FormData>(saveProduct, {});
  const [images, setImages] = useState<ImageProp[]>(product?.images ?? []);
  const [primaryIdx, setPrimaryIdx] = useState(product?.images.findIndex((i) => i.primary) ?? 0);

  const specsLines = product?.specifications ? Object.entries(product.specifications).map(([k, v]) => `${k}: ${v}`) : [];
  const featuresLines = product?.features?.list ?? [];

  const addImage = () => setImages((imgs) => [...imgs, { url: "", alt: "", sortOrder: imgs.length, primary: false }]);
  const removeImage = (idx: number) => setImages((imgs) => imgs.filter((_, i) => i !== idx));
  const setImage = (idx: number, patch: Partial<ImageProp>) => setImages((imgs) => imgs.map((im, i) => (i === idx ? { ...im, ...patch } : im)));

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {state.ok !== undefined && (
        <div className={`kf-toast ${state.ok ? "ok" : "err"}`} role="status">
          {state.ok ? "✓ Product saved" : "✕ Unable to save"}
        </div>
      )}
      {state.error && !state.ok && <p style={{ color: "var(--err)", fontSize: "0.85rem" }}>{state.error}</p>}
      {product && <input type="hidden" name="id" value={product.id} />}

      <Section title="1 · Basic information">
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field label="Product name">
            <input className="input" name="name" defaultValue={product?.name} required disabled={pending} />
          </Field>
          <Field label="Slug" hint="Leave blank to generate from the name.">
            <input className="input" name="slug" defaultValue={product?.slug} disabled={pending} />
          </Field>
          <Field label="Brand">
            <select className="select" name="brandId" defaultValue={product?.brandId ?? ""} disabled={pending}>
              <option value="">No brand</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Category" hint="Database-driven — manage under Categories.">
            <select className="select" name="categoryId" defaultValue={product?.categoryId ?? ""} required disabled={pending}>
              <option value="">Select a category</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "↳ " : ""}{c.name}</option>)}
            </select>
          </Field>
          <Field label="Product type">
            <select className="select" name="type" defaultValue={product?.type ?? ""} required disabled={pending}>
              <option value="">Select a type</option>
              {TYPE_GROUPS.map((t) => <option key={t} value={t}>{PRODUCT_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="Short description" hint="One line shown on product cards (max 400 chars).">
            <input className="input" name="shortDescription" defaultValue={product?.shortDescription ?? ""} maxLength={400} disabled={pending} />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Full description">
              <textarea className="textarea" name="description" defaultValue={product?.description ?? ""} disabled={pending} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="2 · Pricing">
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Field label="Selling price (₹)" hint="What customers pay. Stored in paise.">
            <input className="input" type="number" name="price" defaultValue={product ? product.price / 100 : ""} min={0} step="0.01" required disabled={pending} />
          </Field>
          <Field label="Compare-at price (₹)" hint="Shown struck-through. Leave 0 for no sale.">
            <input className="input" type="number" name="compareAtPrice" defaultValue={product ? (product.compareAtPrice ?? 0) / 100 : ""} min={0} step="0.01" disabled={pending} />
          </Field>
          <Field label="Cost price (₹)" hint="Internal only — never shown to customers.">
            <input className="input" type="number" name="costPrice" defaultValue={product ? (product.costPrice ?? 0) / 100 : ""} min={0} step="0.01" disabled={pending} />
          </Field>
          <Field label="GST rate (%)" hint="Applied at checkout for taxable goods.">
            <input className="input" type="number" name="gstRate" defaultValue={product?.gstRate ?? 0} min={0} max={100} step="0.01" disabled={pending} />
          </Field>
        </div>
      </Section>

      <Section title="3 · Inventory">
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Field label="SKU">
            <input className="input" name="sku" defaultValue={product?.sku ?? ""} disabled={pending} />
          </Field>
          <Field label="Barcode">
            <input className="input" name="barcode" defaultValue={product?.barcode ?? ""} disabled={pending} />
          </Field>
          <Field label="Stock quantity" hint="Tracked per variant too (below on the product page).">
            <input className="input" type="number" name="stock" defaultValue={product?.stock ?? 0} min={0} step="1" disabled={pending} />
          </Field>
          <Field label="Low-stock threshold">
            <input className="input" type="number" name="lowStockThreshold" defaultValue={product?.lowStockThreshold ?? 5} min={0} step="1" disabled={pending} />
          </Field>
          <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
            <input type="checkbox" name="allowBackorders" defaultChecked={product?.allowBackorders ?? false} disabled={pending} /> Allow backorders
          </label>
          <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
            <input type="checkbox" name="inventoryTracking" defaultChecked={product?.inventoryTracking ?? true} disabled={pending} /> Track inventory
          </label>
        </div>
      </Section>

      <Section title="4 · Images" >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="admin-actions" style={{ gap: 8 }}>
            <button type="button" className="btn-admin" onClick={addImage} disabled={pending}>+ Add image URL</button>
            <span className="muted">Uploads are handled on the product page when Cloudinary is configured.</span>
          </div>
          {images.length === 0 ? (
            <div className="empty"><b>No images yet</b>Add an image URL or upload to Cloudinary.</div>
          ) : (
            images.map((img, i) => (
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: "var(--r-sm)", padding: 10 }}>
                <label className="flex items-center gap-2" style={{ fontSize: "0.78rem" }}>
                  <input type="radio" name="imagePrimary" value={i} checked={i === primaryIdx} onChange={() => setPrimaryIdx(i)} disabled={pending} /> Primary
                </label>
                <input type="hidden" name="imageOrder" value={img.sortOrder} />
                <input className="input" value={img.url} placeholder="Image URL" style={{ flex: "1 1 220px" }} onChange={(e) => setImage(i, { url: e.target.value })} name="imageUrl" />
                <input className="input" value={img.alt ?? ""} placeholder="Alt text" style={{ flex: "1 1 160px" }} onChange={(e) => setImage(i, { alt: e.target.value })} name="imageAlt" />
                <button type="button" className="btn-admin sm danger" onClick={() => removeImage(i)} disabled={pending}>Remove</button>
              </div>
            ))
          )}
          <div className="muted" style={{ fontSize: "0.7rem" }}>
            Preview: {images.filter((i) => i.url).length} image{images.filter((i) => i.url).length === 1 ? "" : "s"}.
          </div>
        </div>
      </Section>

      <Section title="5 · Description extras">
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field label="Features" hint="One per line.">
            <textarea className="textarea" name="features" defaultValue={featuresLines.join("\n")} disabled={pending} />
          </Field>
          <Field label="What's included" hint="One per line.">
            <textarea className="textarea" name="whatsIncluded" defaultValue={product?.whatsIncluded?.list?.join("\n") ?? ""} disabled={pending} />
          </Field>
          <Field label="Warranty information">
            <textarea className="textarea" name="warrantyInfo" defaultValue={product?.warrantyInfo ?? ""} disabled={pending} />
          </Field>
          <Field label="Shipping information">
            <textarea className="textarea" name="shippingInfo" defaultValue={product?.shippingInfo ?? ""} disabled={pending} />
          </Field>
        </div>
      </Section>

      <Section title="6 · Specifications" >
        <Field label="Specifications" hint="One per line as Key: value (e.g. Layout: 60% / Mounting: Gasket).">
          <textarea className="textarea" name="specs" defaultValue={specsLines.join("\n")} disabled={pending} />
        </Field>
      </Section>

      <Section title="7 · Shipping">
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Field label="Weight (g)">
            <input className="input" type="number" name="weight" defaultValue={product?.weight ?? ""} min={0} step="1" disabled={pending} />
          </Field>
          <Field label="Length (cm)">
            <input className="input" type="number" name="lengthCm" defaultValue={product?.lengthCm ?? ""} min={0} step="0.1" disabled={pending} />
          </Field>
          <Field label="Width (cm)">
            <input className="input" type="number" name="widthCm" defaultValue={product?.widthCm ?? ""} min={0} step="0.1" disabled={pending} />
          </Field>
          <Field label="Height (cm)">
            <input className="input" type="number" name="heightCm" defaultValue={product?.heightCm ?? ""} min={0} step="0.1" disabled={pending} />
          </Field>
          <Field label="Shipping class">
            <input className="input" name="shippingClass" defaultValue={product?.shippingClass ?? ""} disabled={pending} />
          </Field>
          <Field label="Shipping restrictions">
            <input className="input" name="shippingRestrictions" defaultValue={product?.shippingRestrictions ?? ""} disabled={pending} />
          </Field>
          <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
            <input type="checkbox" name="freeShipping" defaultChecked={product?.freeShipping ?? false} disabled={pending} /> Free shipping
          </label>
        </div>
      </Section>

      <Section title="8 · SEO" >
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <Field label="SEO title" hint="Defaults to the product name.">
            <input className="input" name="seoTitle" defaultValue={product?.seoTitle ?? ""} disabled={pending} />
          </Field>
          <Field label="SEO description" hint="Defaults to the short description.">
            <input className="input" name="seoDescription" defaultValue={product?.seoDescription ?? ""} disabled={pending} />
          </Field>
          <Field label="SEO keywords" hint="Comma separated.">
            <input className="input" name="seoKeywords" defaultValue={product?.seoKeywords ?? ""} disabled={pending} />
          </Field>
          <Field label="Canonical URL" hint="Defaults to the product page URL.">
            <input className="input" name="canonicalUrl" defaultValue={product?.canonicalUrl ?? ""} disabled={pending} />
          </Field>
          <Field label="Open Graph image URL" hint="Defaults to the primary image.">
            <input className="input" name="ogImageUrl" defaultValue={product?.ogImageUrl ?? ""} disabled={pending} />
          </Field>
        </div>
      </Section>

      <Section title="9 · Publishing">
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Field label="Status">
            <select className="select" name="status" defaultValue={product?.status ?? "ACTIVE"} disabled={pending}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <div className="flex flex-col gap-2" style={{ justifyContent: "center" }}>
            <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
              <input type="checkbox" name="featured" defaultChecked={product?.featured ?? false} disabled={pending} /> Featured
            </label>
            <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
              <input type="checkbox" name="popular" defaultChecked={product?.popular ?? false} disabled={pending} /> Popular
            </label>
            <label className="flex items-center gap-2" style={{ fontSize: "0.85rem" }}>
              <input type="checkbox" name="isNew" defaultChecked={product?.isNew ?? false} disabled={pending} /> Mark as new
            </label>
          </div>
        </div>
      </Section>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button type="submit" className="btn-admin primary" disabled={pending}>
          {pending ? <>Saving…</> : product ? "Save changes" : "Create product"}
        </button>
        <button type="button" className="btn-admin" onClick={() => router.back()} disabled={pending}>Cancel</button>
      </div>
    </form>
  );
}