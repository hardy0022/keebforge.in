"use client";

import { useState } from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { saveProduct, type CatalogActionState } from "@/app/admin/actions/catalog";
import { PRODUCT_STATUS_LABELS, PRODUCT_TYPE_LABELS, type ProductType } from "@/lib/product-labels";
import { CARD_ICONS, CARD_ICON_NAMES } from "@/lib/card-icons";
import { MAX_CARD_FEATURES, CONDITION_LABELS } from "@/lib/shop";

const SECTION_TYPE_OPTIONS = [
  { value: "NEW", label: "New / In Stock" },
  { value: "CUSTOM", label: "Custom Order" },
  { value: "CLEARANCE", label: "Clearance / Used" },
] as const;

type CategoryProp = { id: string; name: string; parentId: string | null };
type BrandProp = { id: string; name: string };
type ImageProp = { url: string; alt: string | null; sortOrder: number; primary: boolean; publicId?: string | null };
type UploadedAsset = { publicId: string; url: string; width: number; height: number };
type CardFeature = { icon: string; label: string; value: string };
type OptionGroupState = { id?: string; name: string; required: boolean; options: { id?: string; name: string; addon: string }[] };

type ProductProp = {
  id: string;
  name: string;
  slug: string;
  type: ProductType;
  categoryId: string;
  brandId: string | null;
  description: string | null;
  features: { list?: string[] } | null;
  whatsIncluded: { list?: string[] } | null;
  warrantyInfo: string | null;
  shippingInfo: string | null;
  specifications: Record<string, string> | null;
  cardFeatures: { icon: string; label: string; value: string }[] | null;
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
  productType: "CUSTOM" | "NEW" | "CLEARANCE";
  condition: string | null;
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

export function ProductForm({ product, optionGroups = [], categories, brands }: { product: ProductProp | null; optionGroups?: OptionGroupState[]; categories: CategoryProp[]; brands: BrandProp[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<CatalogActionState, FormData>(saveProduct, {});
  const [images, setImages] = useState<ImageProp[]>(product?.images ?? []);
  const [primaryIdx, setPrimaryIdx] = useState(product?.images.findIndex((i) => i.primary) ?? 0);
  // Fresh Cloudinary uploads (not yet persisted) + their draft folder token.
  const [uploadedAssets, setUploadedAssets] = useState<UploadedAsset[]>([]);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Stable per-form token for staging draft uploads (useState init runs once).
  const [draftToken] = useState(() => Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
  const [cardFeats, setCardFeats] = useState<CardFeature[]>(() =>
    (product?.cardFeatures ?? []).slice(0, MAX_CARD_FEATURES).map((f) => ({ icon: f.icon, label: f.label, value: f.value })),
  );
  const [optGroups, setOptGroups] = useState<OptionGroupState[]>(optionGroups);

  const setFeat = (idx: number, patch: Partial<CardFeature>) =>
    setCardFeats((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const moveFeat = (idx: number, dir: -1 | 1) =>
    setCardFeats((rows) => {
      const next = [...rows];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return rows;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });

  const specsLines = product?.specifications ? Object.entries(product.specifications).map(([k, v]) => `${k}: ${v}`) : [];
  const featuresLines = product?.features?.list ?? [];

  // Serialize the configurator editor: rupee inputs → paise addons; incomplete
  // rows are dropped so the server only sees complete data.
  const optionConfig = JSON.stringify(
    optGroups
      .map((g) => ({
        id: g.id,
        name: g.name.trim(),
        required: g.required,
        options: g.options
          .filter((o) => o.name.trim())
          .map((o) => ({ id: o.id, name: o.name.trim(), addon: Math.round((parseFloat(o.addon) || 0) * 100) })),
      }))
      .filter((g) => g.name && g.options.length > 0),
  );

  const setGroup = (idx: number, patch: Partial<OptionGroupState>) =>
    setOptGroups((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const setOption = (gi: number, oi: number, patch: Partial<OptionGroupState["options"][number]>) =>
    setOptGroups((rows) => rows.map((g, i) => (i === gi ? { ...g, options: g.options.map((o, j) => (j === oi ? { ...o, ...patch } : o)) } : g)));

  const addImage = () => setImages((imgs) => [...imgs, { url: "", alt: "", sortOrder: imgs.length, primary: false }]);
  const moveImage = (idx: number, dir: -1 | 1) =>
    setImages((imgs) => {
      const next = [...imgs];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return imgs;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  const setImage = (idx: number, patch: Partial<ImageProp>) => setImages((imgs) => imgs.map((im, i) => (i === idx ? { ...im, ...patch } : im)));

  async function removeImage(idx: number) {
    const img = images[idx];
    setPrimaryIdx((p) => (idx === p ? 0 : idx < p ? p - 1 : p));
    setImages((imgs) => imgs.filter((_, i) => i !== idx));
    // Freshly uploaded assets exist nowhere yet — destroy them right away so
    // abandoned forms don't orphan files. Saved rows are cleaned up by the
    // server action after save (diff by URL).
    if (img?.publicId && uploadedAssets.some((a) => a.publicId === img.publicId)) {
      setUploadedAssets((rows) => rows.filter((a) => a.publicId !== img.publicId));
      await fetch("/api/uploads?publicId=" + encodeURIComponent(img.publicId), { method: "DELETE" }).catch(() => {});
    }
  }

  function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError(null);
    const entityId = product?.id ?? draftToken;
    const role = product ? "GALLERY" : "DRAFT";
    let done = 0;
    for (const file of Array.from(files)) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("entityType", "PRODUCT");
      fd.set("entityId", entityId);
      fd.set("role", role);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/uploads");
      xhr.upload.onprogress = (e) => e.lengthComputable && setUploadPct(Math.round(((done + e.loaded / e.total) / files.length) * 100));
      xhr.onload = () => {
        done += 1;
        try {
          const data = JSON.parse(xhr.responseText) as { ok?: boolean; url?: string; publicId?: string; width?: number; height?: number; error?: string };
          const statusOk = xhr.status >= 200 && xhr.status < 300;
          if (!statusOk || !data.ok || !data.url || !data.publicId) {
            setUploadError(data.error ?? "Unable to upload image. Please try again.");
          } else {
            const asset: UploadedAsset = { publicId: data.publicId, url: data.url, width: data.width ?? 0, height: data.height ?? 0 };
            setUploadedAssets((rows) => [...rows, asset]);
            setImages((imgs) => [...imgs, { url: data.url!, alt: "", sortOrder: imgs.length, primary: false, publicId: data.publicId }]);
          }
        } catch {
          setUploadError("Unable to upload image. Please try again.");
        }
        setUploadPct(done >= files.length ? null : Math.round((done / files.length) * 100));
      };
      xhr.onerror = () => {
        done += 1;
        setUploadError("Unable to upload image. Please try again.");
        setUploadPct(null);
      };
      xhr.send(fd);
    }
  }

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
          <div style={{ gridColumn: "1 / -1" }}>
            <Field label="Full description">
              <textarea className="textarea" name="description" defaultValue={product?.description ?? ""} disabled={pending} />
            </Field>
          </div>
          <Field label="Product type" hint="Where it lives in the shop: custom, in-stock or clearance.">
            <select className="select" name="productType" defaultValue={product?.productType ?? "NEW"} disabled={pending}>
              {SECTION_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Condition" hint="For clearance / used items only.">
            <select className="select" name="condition" defaultValue={product?.condition ?? ""} disabled={pending}>
              <option value="">—</option>
              {Object.entries(CONDITION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
      </Section>

      <Section title="2 · Pricing">
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Field label="Selling price (₹)" hint="What customers pay. Stored in paise.">
            <input className="input" type="number" name="price" defaultValue={product ? product.price / 100 : ""} min={0} step="1" required disabled={pending} />
          </Field>
          <Field label="Compare-at price (₹)" hint="Shown struck-through. Leave 0 for no sale.">
            <input className="input" type="number" name="compareAtPrice" defaultValue={product ? (product.compareAtPrice ?? 0) / 100 : ""} min={0} step="1" disabled={pending} />
          </Field>
          <Field label="Cost price (₹)" hint="Internal only — never shown to customers.">
            <input className="input" type="number" name="costPrice" defaultValue={product ? (product.costPrice ?? 0) / 100 : ""} min={0} step="1" disabled={pending} />
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

      <Section title="4 · Images">
        <p className="muted" style={{ fontSize: "0.75rem", marginBottom: 8 }}>
          Uploaded images are stored in Cloudinary under this product&apos;s own folder. The main image is the shop card &amp; OG image.
        </p>
        <div className="admin-actions" style={{ flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          <label className="btn-admin" style={{ cursor: "pointer" }}>
            + Upload images
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              hidden
              onChange={(e) => {
                uploadFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
          <button type="button" className="btn-admin sm" onClick={addImage} disabled={pending}>+ Add by URL</button>
        </div>
        {uploadPct !== null && <p className="muted" style={{ fontSize: "0.8rem" }}>Uploading… {uploadPct}%</p>}
        {uploadError && <p style={{ fontSize: "0.8rem", color: "#e5484d" }} role="alert">{uploadError}</p>}
        {images.length === 0 ? (
          <div className="empty"><b>No images yet</b>Upload files or add an image URL.</div>
        ) : (
          images.map((img, i) => (
            <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: "var(--r-sm)", padding: 10 }}>
              <label title="Set as main image" className="flex items-center gap-2" style={{ fontSize: "0.78rem" }}>
                <input type="radio" name="imagePrimary" value={i} checked={i === primaryIdx} onChange={() => setPrimaryIdx(i)} disabled={pending} /> Main
              </label>
              {img.url ? (
                // eslint-disable-next-line @next/next/no-img-element -- admin preview thumbnail
                <img src={img.url} alt="" style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--bdr)" }} />
              ) : (
                <span style={{ width: 44, height: 44, borderRadius: 6, border: "1px dashed var(--bdr)" }} />
              )}
              <input type="hidden" name="imageOrder" value={i} />
              <input className="input" value={img.url} placeholder="Image URL" style={{ flex: "1 1 200px" }} onChange={(e) => setImage(i, { url: e.target.value })} name="imageUrl" />
              <input className="input" value={img.alt ?? ""} placeholder="Alt text" style={{ flex: "1 1 140px" }} onChange={(e) => setImage(i, { alt: e.target.value })} name="imageAlt" />
              <button type="button" className="btn-admin sm" onClick={() => moveImage(i, -1)} disabled={pending || i === 0} aria-label={`Move image ${i + 1} earlier`}>↑</button>
              <button type="button" className="btn-admin sm" onClick={() => moveImage(i, 1)} disabled={pending || i === images.length - 1} aria-label={`Move image ${i + 1} later`}>↓</button>
              <button type="button" className="btn-admin sm danger" onClick={() => void removeImage(i)} disabled={pending}>Remove</button>
            </div>
          ))
        )}
        {/* Fresh uploads travel to the server action so rows get their publicId
            (drafts are renamed into the product folder on create). */}
        <input type="hidden" name="uploadedAssets" value={JSON.stringify(uploadedAssets)} />
        <input type="hidden" name="draftToken" value={draftToken} />
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

      <Section title="7 · Key features">
        <input type="hidden" name="cardFeatures" value={JSON.stringify(cardFeats)} />
        <p className="muted" style={{ fontSize: "0.72rem", margin: 0 }}>
          Add up to {MAX_CARD_FEATURES} key features shown on the shop product card (icon + label + value).
        </p>
        {cardFeats.map((f, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: "var(--r-sm)", padding: 10 }}>
            <span className="muted" style={{ fontSize: "0.7rem", width: 58 }}>Feature {i + 1}</span>
            <select className="select" value={f.icon} onChange={(e) => setFeat(i, { icon: e.target.value })} disabled={pending} style={{ width: 130 }} aria-label={`Feature ${i + 1} icon`}>
              {CARD_ICON_NAMES.map((name) => (
                <option key={name} value={name}>{CARD_ICONS[name].label}</option>
              ))}
            </select>
            <input className="input" value={f.label} maxLength={40} placeholder="Label (e.g. Sensor)" onChange={(e) => setFeat(i, { label: e.target.value })} disabled={pending} style={{ flex: "1 1 140px" }} aria-label={`Feature ${i + 1} label`} />
            <input className="input" value={f.value} maxLength={60} placeholder="Value (e.g. Focus Pro 30K)" onChange={(e) => setFeat(i, { value: e.target.value })} disabled={pending} style={{ flex: "1 1 160px" }} aria-label={`Feature ${i + 1} value`} />
            <button type="button" className="btn-admin sm" onClick={() => moveFeat(i, -1)} disabled={pending || i === 0} aria-label="Move up">↑</button>
            <button type="button" className="btn-admin sm" onClick={() => moveFeat(i, 1)} disabled={pending || i === cardFeats.length - 1} aria-label="Move down">↓</button>
            <button type="button" className="btn-admin sm danger" onClick={() => setCardFeats((rows) => rows.filter((_, j) => j !== i))} disabled={pending} aria-label="Remove feature">✕</button>
          </div>
        ))}
        <div className="admin-actions" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn-admin"
            onClick={() => setCardFeats((rows) => [...rows, { icon: "zap", label: "", value: "" }])}
            disabled={pending || cardFeats.length >= MAX_CARD_FEATURES}
          >
            + Add feature
          </button>
          <span className="muted" style={{ fontSize: "0.7rem" }}>
            {cardFeats.length >= MAX_CARD_FEATURES
              ? `Maximum ${MAX_CARD_FEATURES} features reached`
              : `${cardFeats.length}/${MAX_CARD_FEATURES} used — rows with an empty label or value are ignored.`}
          </span>
        </div>
      </Section>

      <Section title="8 · Product configuration">
        <input type="hidden" name="optionConfig" value={optionConfig} />
        <p className="muted" style={{ fontSize: "0.72rem", margin: 0 }}>
          Up to 3 option groups (e.g. Case Color, Switch Choice). Customer price = base price + add-ons.
          Leave empty for a simple product.
        </p>
        {optGroups.map((g, gi) => (
          <div key={gi} style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--surf)", border: "1px solid var(--bdr)", borderRadius: "var(--r-sm)", padding: 10 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="muted" style={{ fontSize: "0.7rem", width: 58 }}>Group {gi + 1}</span>
              <input className="input" value={g.name} maxLength={60} placeholder="Group name (e.g. Case Color)" onChange={(e) => setGroup(gi, { name: e.target.value })} disabled={pending} style={{ flex: "1 1 180px" }} aria-label={`Group ${gi + 1} name`} />
              <label className="flex items-center gap-2" style={{ fontSize: "0.78rem" }}>
                <input type="checkbox" checked={g.required} onChange={(e) => setGroup(gi, { required: e.target.checked })} disabled={pending} /> Required
              </label>
              <button type="button" className="btn-admin sm danger" onClick={() => setOptGroups((rows) => rows.filter((_, j) => j !== gi))} disabled={pending}>Remove group</button>
            </div>
            {g.options.map((o, oi) => (
              <div key={oi} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingLeft: 66 }}>
                <input className="input" value={o.name} maxLength={60} placeholder="Option (e.g. Brass)" onChange={(e) => setOption(gi, oi, { name: e.target.value })} disabled={pending} style={{ flex: "1 1 140px" }} aria-label={`Group ${gi + 1} option ${oi + 1} name`} />
                <input className="input" type="number" value={o.addon} min={0} step="1" placeholder="0" onChange={(e) => setOption(gi, oi, { addon: e.target.value })} disabled={pending} style={{ width: 120 }} aria-label={`Group ${gi + 1} option ${oi + 1} add-on price in rupees`} />
                <span className="muted" style={{ fontSize: "0.7rem" }}>₹ add-on</span>
                <button type="button" className="btn-admin sm danger" onClick={() => setGroup(gi, { options: g.options.filter((_, j) => j !== oi) })} disabled={pending} aria-label="Remove option">✕</button>
              </div>
            ))}
            <div style={{ paddingLeft: 66 }}>
              <button type="button" className="btn-admin sm" onClick={() => setGroup(gi, { options: [...g.options, { name: "", addon: "" }] })} disabled={pending}>+ Add option</button>
            </div>
          </div>
        ))}
        <div className="admin-actions" style={{ gap: 8 }}>
          <button
            type="button"
            className="btn-admin"
            onClick={() => setOptGroups((rows) => [...rows, { name: "", required: true, options: [{ name: "", addon: "" }] }])}
            disabled={pending || optGroups.length >= 3}
          >
            + Add option group
          </button>
          <span className="muted" style={{ fontSize: "0.7rem" }}>{optGroups.length}/3 groups — incomplete rows are ignored.</span>
        </div>
      </Section>

      <Section title="9 · Shipping">
        <p className="muted" style={{ fontSize: "0.75rem", marginBottom: 8 }}>
          Used to calculate Delhivery shipping rates. Weight is required for paid-shipping products; dimensions enable volumetric-weight pricing.
        </p>
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

      <Section title="10 · SEO" >
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

      <Section title="11 · Publishing">
        <div className="admin-grid cols-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <Field label="Status">
            <select className="select" name="status" defaultValue={product?.status ?? "ACTIVE"} disabled={pending}>
              {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <div className="flex flex-col gap-2" style={{ justifyContent: "center" }}>
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