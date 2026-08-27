// KeebForge.in — test product seed
// Creates a fully-populated test keyboard with option groups, variants, images, and specs.
//
// Run: npx tsx prisma/seed-test-product.ts

import { PrismaClient, Prisma, ProductType, ProductStatus } from "@prisma/client";

const prisma = new PrismaClient();
const p = (rupees: number) => Math.round(rupees * 100);

async function main() {
  console.log("Seeding test keyboard product…");

  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "keyboards" } });
  const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: "keychron" } });

  // ── Product ────────────────────────────────────────────────────────────────
  const slug = "keebforge-test-75he";
  const data: Prisma.ProductUncheckedCreateInput = {
    name: "KeebForge Test 75% HE Keyboard",
    slug,
    type: ProductType.KEYBOARD,
    status: ProductStatus.ACTIVE,
    productType: "NEW",
    condition: "NEW",
    categoryId: category.id,
    brandId: brand.id,

    description: "This is a comprehensive test product created to verify every field in the KeebForge product model. It includes pricing tiers, inventory tracking, specifications, SEO metadata, card highlights, option groups with pricing add-ons, and variant support. Use this to validate the shop UI, cart flow, checkout, and admin product editing.",

    features: { list: [
      "CNC aluminium case with gasket mount",
      "Hall-effect magnetic switches (0.1mm precision)",
      "QMK / VIA firmware support",
      "South-facing per-key RGB",
      "PBT double-shot keycaps",
      "Hot-swappable switch sockets",
      "USB-C and Bluetooth 5.1 connectivity",
      "4000mAh rechargeable battery",
    ] } as Prisma.InputJsonValue,

    whatsIncluded: { list: [
      "Keyboard unit with pre-installed switches",
      "Coiled USB-C cable (1.5m)",
      "Keycap puller",
      "Switch puller",
      "Extra magnetic switches (4 pcs)",
      "Carrying case",
      "Quick start guide",
      "Sticker pack",
    ] } as Prisma.InputJsonValue,

    specifications: {
      "Layout": "75% (84 keys)",
      "Mount": "Gasket mount",
      "Case Material": "CNC 6063 Aluminium",
      "Plate Material": "Polycarbonate",
      "Switches": "Kailh Hall-effect Magnetic v2",
      "Keycaps": "PBT double-shot, Cherry profile",
      "Hot-swap": "Yes (5-pin)",
      "Connectivity": "USB-C wired + Bluetooth 5.1",
      "Battery": "4000mAh Li-Po",
      "RGB": "South-facing per-key RGB, 16.8M colors",
      "Firmware": "QMK / VIA compatible",
      "Weight": "1.2 kg",
      "Dimensions": "330 × 140 × 40 mm",
      "N-Key Rollover": "Full NKRO",
      "Polling Rate": "1000Hz (wired) / 500Hz (BT)",
    } as Prisma.InputJsonValue,

    cardFeatures: [
      { icon: "layout", label: "Layout", value: "75%" },
      { icon: "switch", label: "Switches", value: "Hall-effect" },
      { icon: "bluetooth", label: "Connectivity", value: "USB-C + BT 5.1" },
      { icon: "rgb", label: "RGB", value: "Per-key" },
    ] as Prisma.InputJsonValue,

    price: p(19999),
    compareAtPrice: p(24999),
    costPrice: p(15000),
    gstRate: 18,

    sku: "KF-TEST-75HE-BLK",
    barcode: "8901234567890",
    stock: 25,
    lowStockThreshold: 5,
    allowBackorders: false,
    inventoryTracking: true,

    weight: 1200,
    lengthCm: 33,
    widthCm: 14,
    heightCm: 4,
    shippingClass: "standard",
    freeShipping: false,
    shippingRestrictions: null,

    seoTitle: "KeebForge Test 75% HE Keyboard | Hall-Effect Magnetic Switches",
    seoDescription: "Test product: Gasket-mount 75% keyboard with Hall-effect magnetic switches, QMK support, Bluetooth 5.1, and per-key RGB. Every field populated.",
    seoKeywords: "test keyboard, hall effect, 75 percent, gasket mount, QMK, magnetic switches",
    canonicalUrl: "https://keebforge.in/product/keebforge-test-75he",
    ogImageUrl: null,

    featured: true,
    popular: true,
    isNew: true,
    active: true,
  };

  await prisma.product.upsert({ where: { slug }, update: data, create: data });
  const product = await prisma.product.findUniqueOrThrow({ where: { slug } });
  console.log(`  ✓ Product: ${product.name} (${product.id})`);

  // ── Images ─────────────────────────────────────────────────────────────────
  const images = [
    { url: "/images/work/sample-04.webp", alt: "KeebForge Test 75% HE Keyboard — front view", sortOrder: 0, primary: true },
    { url: "/images/work/sample-03.webp", alt: "KeebForge Test 75% HE Keyboard — side angle", sortOrder: 1, primary: false },
    { url: "/images/work/sample-05.webp", alt: "KeebForge Test 75% HE Keyboard — keycap close-up", sortOrder: 2, primary: false },
  ];

  for (const img of images) {
    const id = `img:${product.id}:${img.url}`;
    await prisma.productImage.upsert({
      where: { id },
      update: { url: img.url, alt: img.alt, sortOrder: img.sortOrder, primary: img.primary, active: true },
      create: { id, productId: product.id, ...img, active: true },
    });
  }
  console.log(`  ✓ Images: ${images.length} uploaded`);

  // ── Option groups ──────────────────────────────────────────────────────────
  // Group 1: Case Color
  const caseGroup = await prisma.productOptionGroup.upsert({
    where: { id: `optgrp:${product.id}:case-color` },
    update: { name: "Case Color", required: true, sortOrder: 0, enabled: true },
    create: {
      id: `optgrp:${product.id}:case-color`,
      productId: product.id,
      name: "Case Color",
      required: true,
      sortOrder: 0,
      enabled: true,
    },
  });

  const caseOptions = [
    { name: "Space Gray", priceAddon: 0, sortOrder: 0 },
    { name: "Silver", priceAddon: 0, sortOrder: 1 },
    { name: "Midnight Black", priceAddon: p(500), sortOrder: 2 },
    { name: "Rose Gold", priceAddon: p(1000), sortOrder: 3 },
  ];

  for (const opt of caseOptions) {
    await prisma.productOption.upsert({
      where: { id: `opt:${caseGroup.id}:${opt.name.toLowerCase().replace(/\s+/g, "-")}` },
      update: { priceAddon: opt.priceAddon, sortOrder: opt.sortOrder, enabled: true },
      create: {
        id: `opt:${caseGroup.id}:${opt.name.toLowerCase().replace(/\s+/g, "-")}`,
        groupId: caseGroup.id,
        name: opt.name,
        priceAddon: opt.priceAddon,
        sortOrder: opt.sortOrder,
        enabled: true,
      },
    });
  }
  console.log(`  ✓ Option group: Case Color (${caseOptions.length} options)`);

  // Group 2: Switch Type
  const switchGroup = await prisma.productOptionGroup.upsert({
    where: { id: `optgrp:${product.id}:switch-type` },
    update: { name: "Switch Type", required: true, sortOrder: 1, enabled: true },
    create: {
      id: `optgrp:${product.id}:switch-type`,
      productId: product.id,
      name: "Switch Type",
      required: true,
      sortOrder: 1,
      enabled: true,
    },
  });

  const switchOptions = [
    { name: "Kailh HE Red (Linear)", priceAddon: 0, sortOrder: 0 },
    { name: "Kailh HE Black (Linear)", priceAddon: p(500), sortOrder: 1 },
    { name: "Kailh HE Silver (Speed)", priceAddon: p(800), sortOrder: 2 },
  ];

  for (const opt of switchOptions) {
    await prisma.productOption.upsert({
      where: { id: `opt:${switchGroup.id}:${opt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` },
      update: { priceAddon: opt.priceAddon, sortOrder: opt.sortOrder, enabled: true },
      create: {
        id: `opt:${switchGroup.id}:${opt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        groupId: switchGroup.id,
        name: opt.name,
        priceAddon: opt.priceAddon,
        sortOrder: opt.sortOrder,
        enabled: true,
      },
    });
  }
  console.log(`  ✓ Option group: Switch Type (${switchOptions.length} options)`);

  // Group 3: Keycap Set
  const keycapGroup = await prisma.productOptionGroup.upsert({
    where: { id: `optgrp:${product.id}:keycap-set` },
    update: { name: "Keycap Set", required: false, sortOrder: 2, enabled: true },
    create: {
      id: `optgrp:${product.id}:keycap-set`,
      productId: product.id,
      name: "Keycap Set",
      required: false,
      sortOrder: 2,
      enabled: true,
    },
  });

  const keycapOptions = [
    { name: "Stock PBT (Included)", priceAddon: 0, sortOrder: 0 },
    { name: "GMK Laser Upgrade", priceAddon: p(8000), sortOrder: 1 },
    { name: "Akko Macaron Upgrade", priceAddon: p(3000), sortOrder: 2 },
  ];

  for (const opt of keycapOptions) {
    await prisma.productOption.upsert({
      where: { id: `opt:${keycapGroup.id}:${opt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` },
      update: { priceAddon: opt.priceAddon, sortOrder: opt.sortOrder, enabled: true },
      create: {
        id: `opt:${keycapGroup.id}:${opt.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
        groupId: keycapGroup.id,
        name: opt.name,
        priceAddon: opt.priceAddon,
        sortOrder: opt.sortOrder,
        enabled: true,
      },
    });
  }
  console.log(`  ✓ Option group: Keycap Set (${keycapOptions.length} options)`);

  // ── Variants ───────────────────────────────────────────────────────────────
  const variants = [
    {
      name: "Space Gray / Kailh HE Red",
      sku: "KF-TEST-75HE-SG-RED",
      price: null, // inherit from product
      compareAtPrice: null,
      stock: 10,
      weight: 1200,
      options: { "Case Color": "Space Gray", "Switch Type": "Kailh HE Red (Linear)" },
    },
    {
      name: "Silver / Kailh HE Black",
      sku: "KF-TEST-75HE-SV-BLK",
      price: p(20999), // override
      compareAtPrice: p(25999),
      stock: 8,
      weight: 1250,
      options: { "Case Color": "Silver", "Switch Type": "Kailh HE Black (Linear)" },
    },
    {
      name: "Midnight Black / Kailh HE Silver",
      sku: "KF-TEST-75HE-MB-SLV",
      price: p(21999), // override
      compareAtPrice: p(26999),
      stock: 7,
      weight: 1300,
      options: { "Case Color": "Midnight Black", "Switch Type": "Kailh HE Silver (Speed)" },
    },
  ];

  for (const v of variants) {
    await prisma.productVariant.upsert({
      where: { id: `var:${product.id}:${v.sku}` },
      update: {
        name: v.name,
        sku: v.sku,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stock: v.stock,
        weight: v.weight,
        options: v.options as Prisma.InputJsonValue,
        active: true,
      },
      create: {
        id: `var:${product.id}:${v.sku}`,
        productId: product.id,
        name: v.name,
        sku: v.sku,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stock: v.stock,
        weight: v.weight,
        options: v.options as Prisma.InputJsonValue,
        active: true,
      },
    });
  }
  console.log(`  ✓ Variants: ${variants.length} created`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const finalProduct = await prisma.product.findUniqueOrThrow({
    where: { slug },
    include: { images: true, optionGroups: { include: { options: true } }, variants: true },
  });

  console.log("\n━━━ Test product created successfully ━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  Name:       ${finalProduct.name}`);
  console.log(`  Slug:       ${finalProduct.slug}`);
  console.log(`  ID:         ${finalProduct.id}`);
  console.log(`  Price:      ₹${finalProduct.price / 100}`);
  console.log(`  Stock:      ${finalProduct.stock}`);
  console.log(`  Images:     ${finalProduct.images.length}`);
  console.log(`  Options:    ${finalProduct.optionGroups.length} groups (${finalProduct.optionGroups.reduce((s, g) => s + g.options.length, 0)} total)`);
  console.log(`  Variants:   ${finalProduct.variants.length}`);
  console.log(`  View at:    http://localhost:3000/product/${finalProduct.slug}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
