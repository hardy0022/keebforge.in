// KeebForge.in — one fully-populated "Made to Order" (CUSTOM) product.
// CUSTOM products are always orderable unless status OUT_OF_STOCK (lib/shop.ts),
// so all variants/stock sit at 0. Run: npx tsx scripts/seed-custom-product.ts
// Idempotent — re-run to reset fields.

import { PrismaClient, Prisma, ProductType, ProductStatus, ProductCondition, ShopSectionType } from "@prisma/client";

const prisma = new PrismaClient();
const p = (rupees: number) => Math.round(rupees * 100);
const SLUG = "custom-mechanical-keyboard-made-to-order";

const FEATURES = [
  "Fully custom — we source, assemble and tune every part to your brief",
  "Layout, case, plate, switches, keycaps and more all chosen by you",
  "Gasket-mount board, hand-lubed and filmed switches, tuned stabilizers",
  "QMK / VIA firmware flashed and tested by our workshop",
  "Built, verified and photographed before dispatch anywhere in India",
];

const WHATS_INCLUDED = [
  "Barebones keyboard kit (case, PCB, plate, gasket kit)",
  "EKL: your choice of switches and keycaps fitted",
  "Coiled aviator cable",
  "Lube, extra films and a keycap puller",
  "KeebForge warranty + build sheet",
];

const REVIEWS = [
  "Hands down the cleanest build I've owned. Stock sounded dead compared to this.",
  "They walked me through every choice, built in a week, shipped insured. 10/10.",
  "Gasket kit, hand-lubed linears, tuned stabs — a different board after tuning.",
];

async function main() {
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: "keyboards" } });
  console.log(`Using category: ${category.name}`);

  const data = {
    name: "Custom Mechanical Keyboard — Made to Order",
    slug: SLUG,
    type: ProductType.KEYBOARD,
    status: ProductStatus.ACTIVE,
    productType: ShopSectionType.CUSTOM,
    condition: ProductCondition.NEW,
    categoryId: category.id,
    brandId: null,
    description:
      "Tell us how you type, what you play, and which parts you already own — we'll design the rest.\n\n" +
      "Pick your layout (60%, TKL, 75%, Alice or anything in between), we source the plate, foam and gasket kit, install and hand-lube the switches and film them, tune every stabilizer, flash QMK/VIA firmware and stress-test the board before it ships.\n\n" +
      "Each build is quoted, approved and photographed before dispatch. Returns? We service what we build.",
    features: { list: FEATURES } as Prisma.InputJsonValue,
    whatsIncluded: { list: WHATS_INCLUDED } as Prisma.InputJsonValue,
    warrantyInfo: "12-month KeebForge workshop warranty on labour, assembly and firmware.",
    shippingInfo: "Built to order in 7–14 working days. Insured, tracked shipping across India; free shipping on this listing.",
    specifications: {
      Layout: "Your choice (60% / 75% / TKL / Alice)",
      "Mounting Style": "Gasket mount",
      Switches: "Hand-lubed & filmed (your pick)",
      Stabilizers: "Clipped, lubed & tuned",
      Firmware: "QMK / VIA",
      "Hot-Swap": "Yes",
      Connectivity: "USB-C, wired only",
      Guarantee: "1-year workshop warranty",
    },
    cardFeatures: [
      { icon: "keyboard", label: "Bespoke", value: "Your layout" },
      { icon: "zap", label: "Tuning", value: "Lube + film + tuned stabs" },
      { icon: "shield", label: "Warranty", value: "12 months" },
      { icon: "cable", label: "Shipping", value: "Free India-wide" },
    ],
    price: p(19999),
    compareAtPrice: p(24999),
    costPrice: p(15000),
    gstRate: 18,
    sku: "CUSTOM-KEYBOARD-001",
    barcode: "8900000000001",
    stock: 0,
    reservedQuantity: 0,
    lowStockThreshold: 1,
    allowBackorders: true,
    inventoryTracking: true,
    weight: 950,
    lengthCm: 37,
    widthCm: 14.5,
    heightCm: 5,
    shippingClass: "custom-keeb",
    freeShipping: true,
    shippingRestrictions: "Insured, tracked courier across India.",
    seoTitle: "Custom Mechanical Keyboard — Made to Order | KeebForge.in",
    seoDescription:
      "Build a bespoke mechanical keyboard in India: layout, switches, keycaps and case to your spec — assembled, lubed and tuned by KeebForge.",
    seoKeywords: "custom keyboard india, made to order keyboard, custom mech keyboard build",
    canonicalUrl: `https://keebforge.in/product/${SLUG}`,
    active: true,
    featured: true,
    popular: true,
    isNew: true,
    ratingAverage: 4.9,
    ratingCount: 24,
  };

  const product = await prisma.product.upsert({ where: { slug: SLUG }, update: data, create: data });
  console.log(`Product: ${product.name} (${product.slug})`);

  for (const v of [
    { name: "Barebones Kit", sku: "CUSTOM-KEYBOARD-001-BB", price: p(14999), options: { Build: "Barebones — bring your own switches & keycaps" } },
    { name: "Fully Built & Tuned", sku: "CUSTOM-KEYBOARD-001-FB", price: p(19999), options: { Build: "Fully built — switches, keycaps, lube, films & tuning included" } },
  ]) {
    const existing = await prisma.productVariant.findFirst({ where: { productId: product.id, sku: v.sku } });
    const variant =
      existing ?? await prisma.productVariant.create({ data: { productId: product.id, name: v.name, sku: v.sku } });
    const updated = await prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        name: v.name,
        sku: v.sku,
        barcode: null,
        price: v.price,
        compareAtPrice: null,
        stock: 0,
        reservedQuantity: 0,
        active: true,
        options: v.options as Prisma.InputJsonValue,
      },
    });
    console.log(`Variant: ${updated.name} (${updated.sku})`);
  }

  const groups: { name: string; required: boolean; options: { name: string; addon: number }[] }[] = [
    {
      name: "Switch Choice",
      required: true,
      options: [
        { name: "Gateron Milky Yellow Pro (linear)", addon: 0 },
        { name: "Gateron Oil King (linear)", addon: p(800) },
        { name: "Cherry MX Red (linear)", addon: p(500) },
        { name: "Kailh Box Jade (clicky)", addon: p(700) },
      ],
    },
    {
      name: "Keycap Profile",
      required: true,
      options: [
        { name: "Cherry profile", addon: 0 },
        { name: "OEM profile", addon: 0 },
        { name: "SA profile (uniform typing angle)", addon: p(1200) },
      ],
    },
    {
      name: "Your Layout",
      required: true,
      options: [
        { name: "60%", addon: 0 },
        { name: "75%", addon: p(500) },
        { name: "TKL", addon: p(1000) },
        { name: "Alice / ergo", addon: p(2500) },
      ],
    },
  ];

  for (const g of groups) {
    const group =
      (await prisma.productOptionGroup.findFirst({ where: { productId: product.id, name: g.name } })) ??
      (await prisma.productOptionGroup.create({
        data: { productId: product.id, name: g.name, required: g.required, sortOrder: groups.indexOf(g), enabled: true },
      }));
    for (const o of g.options) {
      const option =
        (await prisma.productOption.findFirst({ where: { groupId: group.id, name: o.name } })) ??
        (await prisma.productOption.create({
          data: { groupId: group.id, name: o.name, priceAddon: o.addon, sortOrder: g.options.indexOf(o), enabled: true },
        }));
      await prisma.productOption.update({ where: { id: option.id }, data: { name: o.name, priceAddon: o.addon } });
    }
    console.log(`Option group: ${group.name} (${g.options.length} options)`);
  }

  console.log("Images: none (local placeholder images removed; use Cloudinary media URLs).");

  console.log("\nDone. Preview: https://keebforge.in/shop/custom and /product/" + SLUG);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());