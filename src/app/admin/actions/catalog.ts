"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth/admin";
import { deleteImage, renameAsset } from "@/lib/cloudinary";

export type CatalogActionState = { ok?: boolean; error?: string; id?: string; message?: string };

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Split a textarea into a trimmed list. */
function toList(v: FormDataEntryValue | null): string[] {
  if (typeof v !== "string") return [];
  return v.split("\n").map((l) => l.trim()).filter(Boolean);
}

/** Parse "key: value" or "key=value" lines into a record. */
function toSpecs(v: FormDataEntryValue | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of toList(v)) {
    const idx = line.indexOf(":");
    const eq = idx === -1 ? line.indexOf("=") : idx;
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key) out[key] = val;
  }
  return out;
}

const CARD_ICON_NAMES = new Set(["keyboard", "mouse", "switch", "layers", "box", "cable", "battery", "cpu", "zap", "scale", "droplet", "shield"]);
const MAX_CARD_FEATURES = 3;

/** Parse the card-features editor payload: hard cap of 3 {icon,label,value} highlights. */
function toCardFeatures(v: FormDataEntryValue | null): { icon: string; label: string; value: string }[] {
  if (typeof v !== "string" || !v) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(v);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const out: { icon: string; label: string; value: string }[] = [];
  for (const row of raw.slice(0, MAX_CARD_FEATURES)) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 40) : "";
    const value = typeof r.value === "string" ? r.value.trim().slice(0, 60) : "";
    const icon = typeof r.icon === "string" && CARD_ICON_NAMES.has(r.icon) ? r.icon : "zap";
    if (!label || !value) continue;
    out.push({ icon, label, value });
    if (out.length === MAX_CARD_FEATURES) break;
  }
  return out;
}

const MAX_OPTION_GROUPS = 3;

export type OptionConfigGroup = {
  id?: string;
  name: string;
  required: boolean;
  options: { id?: string; name: string; addon: number }[]; // addon in paise
};

/**
 * Parse the option-configurator editor payload (hidden `optionConfig` input).
 * Returns groups with paise addons, or an error message for the admin form.
 */
function toOptionConfig(v: FormDataEntryValue | null): { error?: string; groups: OptionConfigGroup[] } {
  if (typeof v !== "string" || !v) return { groups: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(v);
  } catch {
    return { error: "Option configuration could not be parsed.", groups: [] };
  }
  if (!Array.isArray(raw)) return { error: "Option configuration is malformed.", groups: [] };
  if (raw.length === 0) return { groups: [] };
  if (raw.length > MAX_OPTION_GROUPS) return { error: `At most ${MAX_OPTION_GROUPS} option groups are allowed.`, groups: [] };

  const groups: OptionConfigGroup[] = [];
  const groupNames = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") return { error: "Option configuration is malformed.", groups: [] };
    const r = row as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim().slice(0, 60) : "";
    if (!name) return { error: "Every option group needs a name.", groups: [] };
    if (groupNames.has(name.toLowerCase())) return { error: `Duplicate option group "${name}".`, groups: [] };
    groupNames.add(name.toLowerCase());

    if (!Array.isArray(r.options) || r.options.length === 0) {
      return { error: `Option group "${name}" needs at least one option.`, groups: [] };
    }
    const options: OptionConfigGroup["options"] = [];
    const optionNames = new Set<string>();
    for (const o of r.options) {
      if (!o || typeof o !== "object") return { error: "Option configuration is malformed.", groups: [] };
      const or = o as Record<string, unknown>;
      const oName = typeof or.name === "string" ? or.name.trim().slice(0, 60) : "";
      if (!oName) return { error: `Every option in "${name}" needs a name.`, groups: [] };
      if (optionNames.has(oName.toLowerCase())) return { error: `Duplicate option "${oName}" in "${name}".`, groups: [] };
      optionNames.add(oName.toLowerCase());
      const addon = typeof or.addon === "number" && Number.isInteger(or.addon) && or.addon >= 0 ? or.addon : -1;
      if (addon < 0) return { error: `Add-on price for "${oName}" must be zero or more.`, groups: [] };
      options.push({
        id: typeof or.id === "string" && or.id ? or.id : undefined,
        name: oName,
        addon,
      });
    }
    groups.push({
      id: typeof r.id === "string" && r.id ? r.id : undefined,
      name,
      required: r.required !== false,
      options,
    });
  }
  return { groups };
}

/** Sync a product's option groups/options with the editor payload, preserving ids. */
async function syncOptionGroups(productId: string, groups: OptionConfigGroup[]) {
  await prisma.$transaction(async (tx) => {
    await tx.productOptionGroup.deleteMany({
      where: { productId, ...(groups.some((g) => g.id) ? { id: { notIn: groups.map((g) => g.id!).filter(Boolean) } } : {}) },
    });
    for (const [gi, g] of groups.entries()) {
      const group = await tx.productOptionGroup.upsert({
        where: { id: g.id ?? "__new__" },
        update: { name: g.name, required: g.required, sortOrder: gi, enabled: true },
        create: { productId, name: g.name, required: g.required, sortOrder: gi, enabled: true },
      });
      await tx.productOption.deleteMany({
        where: { groupId: group.id, ...(g.options.some((o) => o.id) ? { id: { notIn: g.options.map((o) => o.id!).filter(Boolean) } } : {}) },
      });
      for (const [oi, o] of g.options.entries()) {
        await tx.productOption.upsert({
          where: { id: o.id ?? "__new__" },
          update: { name: o.name, priceAddon: o.addon, sortOrder: oi, enabled: true },
          create: { groupId: group.id, name: o.name, priceAddon: o.addon, sortOrder: oi, enabled: true },
        });
      }
    }
  });
}

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required.").max(200),
  slug: z.string().trim().max(200).optional(),
  type: z.string().min(1, "Product type is required."),
  categoryId: z.string().min(1, "Category is required."),
  brandId: z.string().optional(),
  description: z.string().trim().optional(),
  features: z.string().optional(),
  whatsIncluded: z.string().optional(),
  warrantyInfo: z.string().trim().optional(),
  shippingInfo: z.string().trim().optional(),
  specs: z.string().optional(),
  cardFeatures: z.string().optional(),
  price: z.coerce.number().int().min(0, "Price is required."),
  compareAtPrice: z.coerce.number().int().min(0).optional().or(z.literal(0)),
  costPrice: z.coerce.number().int().min(0).optional().or(z.literal(0)),
  gstRate: z.coerce.number().int().min(0).max(100).optional().or(z.literal(0)),
  sku: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(100).optional(),
  stock: z.coerce.number().int().min(0).optional(),
  lowStockThreshold: z.coerce.number().int().min(0).optional(),
  allowBackorders: z.string().optional(),
  inventoryTracking: z.string().optional(),
  weight: z.coerce.number().int().min(0).optional().or(z.literal(0)),
  lengthCm: z.coerce.number().min(0).optional().or(z.literal(0)),
  widthCm: z.coerce.number().min(0).optional().or(z.literal(0)),
  heightCm: z.coerce.number().min(0).optional().or(z.literal(0)),
  shippingClass: z.string().trim().max(100).optional(),
  freeShipping: z.string().optional(),
  shippingRestrictions: z.string().trim().optional(),
  seoTitle: z.string().trim().max(200).optional(),
  seoDescription: z.string().trim().max(400).optional(),
  seoKeywords: z.string().trim().max(300).optional(),
  canonicalUrl: z.string().trim().max(500).optional(),
  ogImageUrl: z.string().trim().max(500).optional(),
  featured: z.string().optional(),
  popular: z.string().optional(),
  isNew: z.string().optional(),
  status: z.string().optional(),
  productType: z.string().optional(),
  condition: z.string().optional(),
});

export async function saveProduct(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  await requirePermission("product", "create");
  const parsed = productSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    type: formData.get("type"),
    categoryId: formData.get("categoryId"),
    brandId: formData.get("brandId") || undefined,
    description: formData.get("description") || undefined,
    features: formData.get("features") || undefined,
    whatsIncluded: formData.get("whatsIncluded") || undefined,
    warrantyInfo: formData.get("warrantyInfo") || undefined,
    shippingInfo: formData.get("shippingInfo") || undefined,
    specs: formData.get("specs") || undefined,
    cardFeatures: formData.get("cardFeatures") || undefined,
    price: formData.get("price"),
    compareAtPrice: formData.get("compareAtPrice") || undefined,
    costPrice: formData.get("costPrice") || undefined,
    gstRate: formData.get("gstRate") || undefined,
    sku: formData.get("sku") || undefined,
    barcode: formData.get("barcode") || undefined,
    stock: formData.get("stock") || undefined,
    lowStockThreshold: formData.get("lowStockThreshold") || undefined,
    allowBackorders: formData.get("allowBackorders") || undefined,
    inventoryTracking: formData.get("inventoryTracking") || undefined,
    weight: formData.get("weight") || undefined,
    lengthCm: formData.get("lengthCm") || undefined,
    widthCm: formData.get("widthCm") || undefined,
    heightCm: formData.get("heightCm") || undefined,
    shippingClass: formData.get("shippingClass") || undefined,
    freeShipping: formData.get("freeShipping") || undefined,
    shippingRestrictions: formData.get("shippingRestrictions") || undefined,
    seoTitle: formData.get("seoTitle") || undefined,
    seoDescription: formData.get("seoDescription") || undefined,
    seoKeywords: formData.get("seoKeywords") || undefined,
    canonicalUrl: formData.get("canonicalUrl") || undefined,
    ogImageUrl: formData.get("ogImageUrl") || undefined,
    featured: formData.get("featured") || undefined,
    popular: formData.get("popular") || undefined,
    isNew: formData.get("isNew") || undefined,
    status: formData.get("status") || undefined,
    productType: formData.get("productType") || undefined,
    condition: formData.get("condition") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid product data." };
  const d = parsed.data;

  const slug = d.slug || slugify(d.name);
  const cardFeatures = toCardFeatures(formData.get("cardFeatures"));
  const optionConfig = toOptionConfig(formData.get("optionConfig"));
  if (optionConfig.error) return { error: optionConfig.error };
  if (!slug) return { error: "A name is required to create a slug." };
  const status = d.status || "ACTIVE";
  const active = status !== "DRAFT" && status !== "ARCHIVED";
  const productType = ["CUSTOM", "NEW", "CLEARANCE"].includes(d.productType ?? "") ? (d.productType as never) : undefined;
  const condition = ["NEW", "OPEN_BOX", "USED", "REFURBISHED", "DISPLAY", "CLEARANCE"].includes(d.condition ?? "")
    ? (d.condition as never)
    : null;

  const data: Prisma.ProductUncheckedCreateInput = {
    ...(d.id ? { id: d.id } : {}),
    name: d.name,
    slug,
    type: d.type as never,
    status: status as never,
    productType,
    condition,
    categoryId: d.categoryId,
    brandId: d.brandId || null,
    description: d.description || null,
    features: d.features ? { list: toList(formData.get("features")) } : Prisma.JsonNull,
    whatsIncluded: d.whatsIncluded ? { list: toList(formData.get("whatsIncluded")) } : Prisma.JsonNull,
    warrantyInfo: d.warrantyInfo || null,
    shippingInfo: d.shippingInfo || null,
    specifications: d.specs ? toSpecs(formData.get("specs")) : Prisma.JsonNull,
    cardFeatures: cardFeatures.length ? (cardFeatures as Prisma.InputJsonValue) : Prisma.JsonNull,
    price: Math.round(d.price * 100),
    compareAtPrice: d.compareAtPrice ? Math.round(d.compareAtPrice * 100) : null,
    costPrice: d.costPrice ? Math.round(d.costPrice * 100) : null,
    gstRate: d.gstRate ?? 0,
    sku: d.sku || null,
    barcode: d.barcode || null,
    stock: d.stock ?? 0,
    lowStockThreshold: d.lowStockThreshold ?? 5,
    allowBackorders: d.allowBackorders === "on",
    inventoryTracking: d.inventoryTracking !== "off",
    weight: d.weight || null,
    lengthCm: d.lengthCm || null,
    widthCm: d.widthCm || null,
    heightCm: d.heightCm || null,
    shippingClass: d.shippingClass || null,
    freeShipping: d.freeShipping === "on",
    shippingRestrictions: d.shippingRestrictions || null,
    seoTitle: d.seoTitle || `${d.name} | KeebForge Shop`,
    seoDescription: d.seoDescription || d.description?.slice(0, 160) || `${d.name} at KeebForge.`,
    seoKeywords: d.seoKeywords || null,
    canonicalUrl: d.canonicalUrl || `${SITE_URL}/product/${slug}`,
    ogImageUrl: d.ogImageUrl || null,
    active,
    featured: d.featured === "on",
    popular: d.popular === "on",
    isNew: d.isNew === "on",
  };

  try {
    const product = await prisma.product.upsert({ where: { id: d.id ?? "__new__" }, update: data, create: data });

    // Images: name="imageUrl" list + matching alt/order + one primary index.
    const urls = formData.getAll("imageUrl").map((v) => String(v)).filter(Boolean);
    const alts = formData.getAll("imageAlt").map((v) => String(v));
    const orders = formData.getAll("imageOrder").map((v) => Number(v) || 0);
    const primaryIdx = Number(formData.get("imagePrimary") ?? "-1");
    // Freshly uploaded assets arrive with their Cloudinary publicIds. Assets
    // uploaded while the product was still a draft live in a staging folder —
    // rename them into the product's permanent folder now that we have its id.
    type UploadedAsset = { publicId: string; url: string; width?: number; height?: number };
    let uploaded: UploadedAsset[] = [];
    try {
      uploaded = JSON.parse(String(formData.get("uploadedAssets") || "[]")) as UploadedAsset[];
    } catch {
      uploaded = [];
    }
    const byUrl = new Map(uploaded.map((a) => [a.url, a]));
    const finalUrls: string[] = [];
    for (const asset of uploaded) {
      if (!asset.publicId.includes("/products/drafts/")) continue;
      const base = asset.publicId.split("/").pop() ?? "image";
      const moved = await renameAsset(asset.publicId, `keebforge/products/${product.id}/${base}`);
      if (moved) {
        byUrl.set(asset.url, moved);
      } else {
        console.error(`[catalog] draft asset stuck in drafts folder: ${asset.publicId}`);
      }
    }

    const newImages = urls.filter(Boolean).map((url, i) => {
      const asset = byUrl.get(url);
      return {
        // A renamed draft asset's form URL still points at /drafts/ (404 after
        // the move) — persist the post-rename secure_url instead.
        url: asset?.url ?? url,
        alt: alts[i] || null,
        sortOrder: orders[i] ?? i,
        primary: i === primaryIdx,
        ...(asset ? { publicId: asset.publicId } : {}),
      };
    });
    finalUrls.push(...newImages.map((i) => i.url));

    if (newImages.length > 0) {
      // Rows no longer in the list are removed outright and their Cloudinary
      // assets destroyed (best-effort; failures are logged for cleanup).
      const removed = await prisma.productImage.findMany({
        where: { productId: product.id, NOT: { url: { in: finalUrls } } },
        select: { id: true, publicId: true },
      });
      if (removed.length > 0) {
        await prisma.productImage.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
        for (const r of removed) {
          if (r.publicId && !(await deleteImage(r.publicId))) {
            console.error(`[catalog] orphaned product asset after removal: ${r.publicId}`);
          }
        }
      }
      for (const img of newImages) {
        await prisma.productImage.upsert({
          where: { id: `img:${product.id}:${img.url}` },
          update: { ...img },
          create: { id: `img:${product.id}:${img.url}`, productId: product.id, ...img },
        });
      }
      await prisma.productImage.updateMany({ where: { productId: product.id }, data: { primary: false } });
      const primary = newImages.find((i) => i.primary) ?? newImages[0];
      await prisma.productImage.updateMany({ where: { productId: product.id, url: primary.url }, data: { primary: true } });
    }

    revalidatePath("/admin/products");
    revalidatePath("/admin/products/inventory");
    revalidatePath("/shop");

    // Option groups sync (empty payload clears all groups).
    if (optionConfig.groups.length > 0 || (await prisma.productOptionGroup.count({ where: { productId: product.id } })) > 0) {
      await syncOptionGroups(product.id, optionConfig.groups);
    }

    return { ok: true, id: product.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: "A product with this slug or SKU already exists." };
    }
    throw e;
  }
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["DRAFT", "ACTIVE", "OUT_OF_STOCK", "ARCHIVED"]),
});

export async function setProductStatus(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  await requirePermission("product", "update");
  const parsed = statusSchema.safeParse({ id: formData.get("id"), status: formData.get("status") });
  if (!parsed.success) return { error: "Invalid request." };
  const { id, status } = parsed.data;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return { error: "Product not found." };

  await prisma.product.update({
    where: { id },
    data: { status, active: status !== "DRAFT" && status !== "ARCHIVED" },
  });
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  return { ok: true };
}

export async function duplicateProduct(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  await requirePermission("product", "create");
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Invalid product." };
  const src = await prisma.product.findUnique({ where: { id }, include: { images: true, optionGroups: { include: { options: true } } } });
  if (!src) return { error: "Product not found." };

  const copy = await prisma.product.create({
    data: {
      name: `${src.name} (Copy)`,
      slug: `${src.slug}-copy`,
      type: src.type,
      status: "DRAFT",
      categoryId: src.categoryId,
      brandId: src.brandId,
      description: src.description,
      features: src.features as Prisma.InputJsonValue,
      whatsIncluded: src.whatsIncluded as Prisma.InputJsonValue,
      warrantyInfo: src.warrantyInfo,
      shippingInfo: src.shippingInfo,
      specifications: src.specifications as Prisma.InputJsonValue,
      cardFeatures: src.cardFeatures as Prisma.InputJsonValue,
      price: src.price,
      compareAtPrice: src.compareAtPrice,
      costPrice: src.costPrice,
      gstRate: src.gstRate,
      sku: src.sku ? `${src.sku}-COPY` : null,
      stock: 0,
      lowStockThreshold: src.lowStockThreshold,
      allowBackorders: src.allowBackorders,
      inventoryTracking: src.inventoryTracking,
      weight: src.weight,
      lengthCm: src.lengthCm,
      widthCm: src.widthCm,
      heightCm: src.heightCm,
      shippingClass: src.shippingClass,
      freeShipping: src.freeShipping,
      shippingRestrictions: src.shippingRestrictions,
      seoTitle: src.seoTitle,
      seoDescription: src.seoDescription,
      seoKeywords: src.seoKeywords,
      canonicalUrl: src.canonicalUrl,
      active: false,
    },
  });

  for (const img of src.images) {
    // publicId intentionally null — the duplicate reuses the same Cloudinary
    // file but must never delete the original's asset.
    await prisma.productImage.create({ data: { productId: copy.id, url: img.url, alt: img.alt, sortOrder: img.sortOrder, primary: img.primary, publicId: null } });
  }

  await prisma.product.update({
    where: { id: copy.id },
    data: {
      optionGroups: {
        create: src.optionGroups.map((g) => ({
          name: g.name,
          required: g.required,
          sortOrder: g.sortOrder,
          enabled: g.enabled,
          options: { create: g.options.map((o) => ({ name: o.name, priceAddon: o.priceAddon, sortOrder: o.sortOrder, enabled: o.enabled })) },
        })),
      },
    },
  });

  revalidatePath("/admin/products");
  return { ok: true, id: copy.id };
}

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required.").max(120),
  slug: z.string().trim().optional(),
  description: z.string().trim().optional(),
  parentId: z.string().optional(),
  image: z.string().trim().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  active: z.string().optional(),
});

export async function saveCategory(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  await requirePermission("product", "create");
  const parsed = categorySchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    description: formData.get("description") || undefined,
    parentId: formData.get("parentId") || undefined,
    image: formData.get("image") || undefined,
    sortOrder: formData.get("sortOrder") || undefined,
    active: formData.get("active") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid category." };
  const d = parsed.data;
  const slug = d.slug || slugify(d.name);

  try {
    const cat = await prisma.category.upsert({
      where: { id: d.id ?? "__new__" },
      update: { name: d.name, slug, description: d.description || null, parentId: d.parentId || null, image: d.image || null, sortOrder: d.sortOrder ?? 0, active: d.active === "on" || d.active === undefined },
      create: { name: d.name, slug, description: d.description || null, parentId: d.parentId || null, image: d.image || null, sortOrder: d.sortOrder ?? 0, active: d.active === "on" || d.active === undefined },
    });
    revalidatePath("/admin/products/categories");
    return { ok: true, id: cat.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "A category with this slug already exists." };
    throw e;
  }
}

const brandSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required.").max(120),
  slug: z.string().trim().optional(),
  logoUrl: z.string().trim().optional(),
  description: z.string().trim().optional(),
  website: z.string().trim().optional(),
  seoTitle: z.string().trim().optional(),
  seoDescription: z.string().trim().optional(),
  active: z.string().optional(),
});

export async function saveBrand(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  await requirePermission("product", "create");
  const parsed = brandSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    logoUrl: formData.get("logoUrl") || undefined,
    description: formData.get("description") || undefined,
    website: formData.get("website") || undefined,
    seoTitle: formData.get("seoTitle") || undefined,
    seoDescription: formData.get("seoDescription") || undefined,
    active: formData.get("active") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid brand." };
  const d = parsed.data;
  const slug = d.slug || slugify(d.name);

  try {
    const brand = await prisma.brand.upsert({
      where: { id: d.id ?? "__new__" },
      update: { name: d.name, slug, logoUrl: d.logoUrl || null, description: d.description || null, website: d.website || null, seoTitle: d.seoTitle || null, seoDescription: d.seoDescription || null, active: d.active === "on" || d.active === undefined },
      create: { name: d.name, slug, logoUrl: d.logoUrl || null, description: d.description || null, website: d.website || null, seoTitle: d.seoTitle || null, seoDescription: d.seoDescription || null, active: d.active === "on" || d.active === undefined },
    });
    revalidatePath("/admin/brands");
    revalidatePath("/shop");
    return { ok: true, id: brand.id };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "A brand with this slug already exists." };
    throw e;
  }
}

const variantSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  name: z.string().trim().min(1, "Variant name is required.").max(120),
  sku: z.string().trim().max(100).optional(),
  barcode: z.string().trim().max(100).optional(),
  price: z.coerce.number().int().min(0).optional().or(z.literal(0)),
  compareAtPrice: z.coerce.number().int().min(0).optional().or(z.literal(0)),
  stock: z.coerce.number().int().min(0).optional(),
  weight: z.coerce.number().int().min(0).optional().or(z.literal(0)),
  options: z.string().optional(),
  active: z.string().optional(),
});

export async function saveVariant(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  await requirePermission("product", "update");
  const parsed = variantSchema.safeParse({
    id: formData.get("id") || undefined,
    productId: formData.get("productId"),
    name: formData.get("name"),
    sku: formData.get("sku") || undefined,
    barcode: formData.get("barcode") || undefined,
    price: formData.get("price") || undefined,
    compareAtPrice: formData.get("compareAtPrice") || undefined,
    stock: formData.get("stock") || undefined,
    weight: formData.get("weight") || undefined,
    options: formData.get("options") || undefined,
    active: formData.get("active") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid variant." };
  const d = parsed.data;
  const parsedOptions = Object.fromEntries(
    d.options?.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.indexOf(":");
      const eq = i === -1 ? l.indexOf("=") : i;
      return eq === -1 ? null : [l.slice(0, eq).trim(), l.slice(eq + 1).trim()] as [string, string];
    }).filter((x): x is [string, string] => x !== null) ?? []
  );

  const product = await prisma.product.findUnique({ where: { id: d.productId } });
  if (!product) return { error: "Product not found." };

  const variant = await prisma.productVariant.upsert({
    where: { id: d.id ?? "__new__" },
    update: {
      name: d.name,
      sku: d.sku || null,
      barcode: d.barcode || null,
      price: d.price ? Math.round(d.price * 100) : null,
      compareAtPrice: d.compareAtPrice ? Math.round(d.compareAtPrice * 100) : null,
      weight: d.weight || null,
      options: Object.keys(parsedOptions).length ? parsedOptions : Prisma.JsonNull,
      active: d.active === "on" || d.active === undefined,
    },
    create: {
      productId: d.productId,
      name: d.name,
      sku: d.sku || null,
      barcode: d.barcode || null,
      price: d.price ? Math.round(d.price * 100) : null,
      compareAtPrice: d.compareAtPrice ? Math.round(d.compareAtPrice * 100) : null,
      stock: d.stock ?? 0,
      weight: d.weight || null,
      options: Object.keys(parsedOptions).length ? parsedOptions : Prisma.JsonNull,
      active: d.active === "on" || d.active === undefined,
    },
  });
  revalidatePath(`/admin/products/${product.id}`);
  revalidatePath("/admin/products/inventory");
  return { ok: true, id: variant.id };
}

export async function deleteVariant(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  await requirePermission("product", "delete");
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Invalid variant." };
  const variant = await prisma.productVariant.findUnique({ where: { id }, include: { product: { select: { id: true } } } });
  if (!variant) return { error: "Variant not found." };
  const cartUsage = await prisma.cartItem.count({ where: { variantId: id } });
  const orderUsage = await prisma.orderItem.count({ where: { variantInfo: { path: ["variantId"], equals: id } } });
  if (cartUsage > 0 || orderUsage > 0) {
    await prisma.productVariant.update({ where: { id }, data: { active: false } });
  } else {
    await prisma.productVariant.delete({ where: { id } });
  }
  revalidatePath(`/admin/products/${variant.product.id}`);
  revalidatePath("/admin/products/inventory");
  return { ok: true };
}

const inventorySchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  kind: z.enum(["receive", "add", "remove", "adjust", "damaged", "lost"]),
  quantity: z.coerce.number().int().min(1).max(100000),
  note: z.string().trim().max(300).optional(),
});

export async function adjustInventory(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  const ctx = await requirePermission("product", "update");
  const profile = await prisma.profile.findUnique({ where: { userId: ctx.user.id }, select: { id: true } });
  if (!profile) return { error: "Your account has no staff profile. Sign in through the site once, then retry." };
  const parsed = inventorySchema.safeParse({
    productId: formData.get("productId"),
    variantId: formData.get("variantId") || undefined,
    kind: formData.get("kind"),
    quantity: formData.get("quantity"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return { error: "Invalid inventory change." };
  const { productId, variantId, kind, quantity, note } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { error: "Product not found." };

  const reason =
    kind === "receive" ? "Received (restock)" :
    kind === "add" ? "Manual add" :
    kind === "remove" ? "Manual remove" :
    kind === "damaged" ? "Marked damaged" :
    kind === "lost" ? "Marked lost" :
    `Adjusted to ${quantity}`;

  // Atomic row-level update so two admits can't double-apply.
  await prisma.$transaction(async (tx) => {
    if (variantId) {
      const current = await tx.productVariant.findUnique({ where: { id: variantId }, select: { stock: true } });
      if (!current) return;
      const delta = kind === "adjust" ? quantity - current.stock : kind === "receive" || kind === "add" ? quantity : -quantity;
      await tx.productVariant.update({ where: { id: variantId }, data: { stock: { increment: delta } } });
      await tx.inventoryMovement.create({ data: { productId, variantId, profileId: profile.id, delta, reason: note ? `${reason} — ${note}` : reason } });
    } else {
      const current = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } });
      if (!current) return;
      const delta = kind === "adjust" ? quantity - current.stock : kind === "receive" || kind === "add" ? quantity : -quantity;
      await tx.product.update({ where: { id: productId }, data: { stock: { increment: delta } } });
      await tx.inventoryMovement.create({ data: { productId, profileId: profile.id, delta, reason: note ? `${reason} — ${note}` : reason } });
    }
  });

  revalidatePath("/admin/products/inventory");
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

/** Minimal CSV parser supporting quoted fields (matches the export format). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQ = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else {
      cur += ch;
    }
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    if (row.some((c) => c !== "")) rows.push(row);
  }
  return rows;
}

export async function importProducts(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  await requirePermission("product", "create");
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Attach a CSV file." };
  const text = await file.text();
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return { error: "CSV is empty." };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const categories = await prisma.category.findMany({ select: { id: true, slug: true } });
  const brands = await prisma.brand.findMany({ select: { id: true, slug: true } });
  const catBySlug = new Map(categories.map((c) => [c.slug, c.id]));
  const brandBySlug = new Map(brands.map((b) => [b.slug, b.id]));

  let created = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const name = row[idx("name")]?.trim();
    if (!name) {
      skipped++;
      continue;
    }
    const slug = (row[idx("slug")]?.trim() || slugify(name)).toLowerCase();
    const categorySlug = row[idx("category")]?.trim();
    const categoryId = categorySlug ? catBySlug.get(categorySlug) : undefined;
    if (!categoryId) {
      skipped++;
      continue;
    }
    const brandId = row[idx("brand")]?.trim() ? brandBySlug.get(row[idx("brand")].trim()) ?? null : null;
    const price = Math.round(parseFloat(row[idx("price")] ?? "0") * 100);
    const type = row[idx("type")]?.trim().toUpperCase() || "ACCESSORY";
    const status = row[idx("status")]?.trim().toUpperCase() || "DRAFT";

    const exists = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
    if (exists) {
      skipped++;
      continue;
    }
    await prisma.product.create({
      data: {
        name,
        slug,
        type: type as never,
        status: status as never,
        categoryId,
        brandId,
        sku: row[idx("sku")]?.trim() || null,
        barcode: row[idx("barcode")]?.trim() || null,
        price,
        compareAtPrice: row[idx("compareatprice")] ? Math.round(parseFloat(row[idx("compareatprice")]) * 100) : null,
        costPrice: row[idx("costprice")] ? Math.round(parseFloat(row[idx("costprice")]) * 100) : null,
        stock: parseInt(row[idx("stock")] ?? "0", 10) || 0,
        lowStockThreshold: parseInt(row[idx("lowstockthreshold")] ?? "5", 10) || 5,
        gstRate: parseInt(row[idx("gstrate")] ?? "0", 10) || 0,
        featured: row[idx("featured")] === "1",
        active: status === "ACTIVE",
        seoTitle: `${name} | KeebForge Shop`,
        canonicalUrl: `${SITE_URL}/product/${slug}`,
      },
    });
    created++;
  }

  revalidatePath("/admin/products");
  return { ok: true, message: `Imported ${created} product${created === 1 ? "" : "s"}, skipped ${skipped}.` };
}