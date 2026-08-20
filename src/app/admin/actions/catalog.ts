"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

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

const productSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required.").max(200),
  slug: z.string().trim().max(200).optional(),
  type: z.string().min(1, "Product type is required."),
  categoryId: z.string().min(1, "Category is required."),
  brandId: z.string().optional(),
  shortDescription: z.string().trim().max(400).optional(),
  description: z.string().trim().optional(),
  features: z.string().optional(),
  whatsIncluded: z.string().optional(),
  warrantyInfo: z.string().trim().optional(),
  shippingInfo: z.string().trim().optional(),
  specs: z.string().optional(),
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
});

export async function saveProduct(_prev: CatalogActionState, formData: FormData): Promise<CatalogActionState> {
  await requireAdmin();
  const parsed = productSchema.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    type: formData.get("type"),
    categoryId: formData.get("categoryId"),
    brandId: formData.get("brandId") || undefined,
    shortDescription: formData.get("shortDescription") || undefined,
    description: formData.get("description") || undefined,
    features: formData.get("features") || undefined,
    whatsIncluded: formData.get("whatsIncluded") || undefined,
    warrantyInfo: formData.get("warrantyInfo") || undefined,
    shippingInfo: formData.get("shippingInfo") || undefined,
    specs: formData.get("specs") || undefined,
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
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid product data." };
  const d = parsed.data;

  const slug = d.slug || slugify(d.name);
  if (!slug) return { error: "A name is required to create a slug." };
  const status = d.status || "ACTIVE";
  const active = status !== "DRAFT" && status !== "ARCHIVED";

  const data: Prisma.ProductUncheckedCreateInput = {
    ...(d.id ? { id: d.id } : {}),
    name: d.name,
    slug,
    type: d.type as never,
    status: status as never,
    categoryId: d.categoryId,
    brandId: d.brandId || null,
    shortDescription: d.shortDescription || null,
    description: d.description || null,
    features: d.features ? { list: toList(formData.get("features")) } : Prisma.JsonNull,
    whatsIncluded: d.whatsIncluded ? { list: toList(formData.get("whatsIncluded")) } : Prisma.JsonNull,
    warrantyInfo: d.warrantyInfo || null,
    shippingInfo: d.shippingInfo || null,
    specifications: d.specs ? toSpecs(formData.get("specs")) : Prisma.JsonNull,
    price: d.price,
    compareAtPrice: d.compareAtPrice || null,
    costPrice: d.costPrice || null,
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
    seoDescription: d.seoDescription || d.shortDescription || d.description?.slice(0, 160) || `${d.name} at KeebForge.`,
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
    const newImages = urls.map((url, i) => ({ url, alt: alts[i] || null, sortOrder: orders[i] ?? i, primary: i === primaryIdx }));

    if (newImages.length > 0) {
      // Soft-delete any images no longer in the list (they stay in Cloudinary storage).
      await prisma.productImage.updateMany({ where: { productId: product.id, active: true, NOT: { url: { in: urls } } }, data: { active: false } });
      for (const img of newImages) {
        await prisma.productImage.upsert({
          where: { id: `img:${product.id}:${img.url}` },
          update: { ...img, active: true },
          create: { id: `img:${product.id}:${img.url}`, productId: product.id, ...img },
        });
      }
      await prisma.productImage.updateMany({ where: { productId: product.id, active: true }, data: { primary: false } });
      const primary = newImages.find((i) => i.primary) ?? newImages[0];
      await prisma.productImage.updateMany({ where: { productId: product.id, url: primary.url }, data: { primary: true } });
    }

    revalidatePath("/admin/products");
    revalidatePath("/admin/products/inventory");
    revalidatePath("/shop");
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
  await requireAdmin();
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
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string") return { error: "Invalid product." };
  const src = await prisma.product.findUnique({ where: { id }, include: { images: true } });
  if (!src) return { error: "Product not found." };

  const copy = await prisma.product.create({
    data: {
      name: `${src.name} (Copy)`,
      slug: `${src.slug}-copy`,
      type: src.type,
      status: "DRAFT",
      categoryId: src.categoryId,
      brandId: src.brandId,
      shortDescription: src.shortDescription,
      description: src.description,
      features: src.features as Prisma.InputJsonValue,
      whatsIncluded: src.whatsIncluded as Prisma.InputJsonValue,
      warrantyInfo: src.warrantyInfo,
      shippingInfo: src.shippingInfo,
      specifications: src.specifications as Prisma.InputJsonValue,
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
    await prisma.productImage.create({ data: { productId: copy.id, url: img.url, alt: img.alt, sortOrder: img.sortOrder, primary: img.primary } });
  }

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
  await requireAdmin();
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
  await requireAdmin();
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
  await requireAdmin();
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
      price: d.price || null,
      compareAtPrice: d.compareAtPrice || null,
      weight: d.weight || null,
      options: Object.keys(parsedOptions).length ? parsedOptions : Prisma.JsonNull,
      active: d.active === "on" || d.active === undefined,
    },
    create: {
      productId: d.productId,
      name: d.name,
      sku: d.sku || null,
      barcode: d.barcode || null,
      price: d.price || null,
      compareAtPrice: d.compareAtPrice || null,
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
  await requireAdmin();
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
  const { profile } = await requireAdmin();
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
  await requireAdmin();
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