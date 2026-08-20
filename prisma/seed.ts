// KeebForge.in — database seed
// Source of truth for the initial service catalog, categories, settings,
// reviews and work portfolio. Money is stored as integer paise (₹12 = 1200).
//
// Run: npx tsx prisma/seed.ts  (or npm run db:seed)

import { PrismaClient, Prisma, Device, ServiceUnit, ReviewType, ReviewStatus, Role, ProductType, ProductStatus } from "@prisma/client";

const prisma = new PrismaClient();

// ₹ helper → paise
const p = (rupees: number) => Math.round(rupees * 100);

async function main() {
  console.log("Seeding KeebForge.in…");

  // ─── Service groups & services ────────────────────────────────────────────
  // Prices mirror static.keebforge.in/assets/js/prices.js + homepage mouse prices.

  const groups = [
    {
      name: "Switch Services",
      slug: "switch-services",
      device: Device.KEYBOARD,
      sortOrder: 1,
      services: [
        {
          slug: "krytox-205g0-lubing",
          name: "Krytox 205g0 Lubing",
          description: "Premium lube for buttery feel.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(12),
          popular: true,
        },
        {
          slug: "durock-films",
          name: "Durock Films",
          description: "Reduce wobble, tighter feel.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(7),
        },
        {
          slug: "tx-films",
          name: "TX Films",
          description: "Heavy-duty housing stability.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(9),
        },
        {
          slug: "spring-swap-oil",
          name: "Spring Swap & Oil",
          description: "Your springs, we handle the rest.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(3),
        },
        {
          slug: "switch-stem-tuning",
          name: "Switch Stem Tuning",
          description: "Polish stems, reduce scratchiness.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(5),
        },
        {
          slug: "complete-mod-combo",
          name: "Complete Mod (Combo)",
          description: "Lube + Film + Spring Swap in one precision pass.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(20),
          combo: true,
          popular: true,
          highlight: true,
          replaces: ["krytox-205g0-lubing", "durock-films", "tx-films", "spring-swap-oil", "switch-stem-tuning"],
          sortOrder: 99,
        },
      ],
    },
    {
      name: "Stabilizer Services",
      slug: "stabilizer-services",
      device: Device.KEYBOARD,
      sortOrder: 2,
      services: [
        {
          slug: "full-stabilizer-service",
          name: "Full Stabilizer Service",
          description: "Disassembly, clean, lube, tune.",
          unit: ServiceUnit.PER_STABILIZER,
          price: p(65),
          highlight: true,
          replaces: ["wire-balancing-only", "restore-old-stabilizers"],
        },
        {
          slug: "wire-balancing-only",
          name: "Wire Balancing Only",
          description: "Eliminate rattle and wobble.",
          unit: ServiceUnit.PER_STABILIZER,
          price: p(25),
          exclusiveWith: ["full-stabilizer-service"],
        },
        {
          slug: "restore-old-stabilizers",
          name: "Restore Old Stabilizers",
          description: "Deep clean, back to like-new.",
          unit: ServiceUnit.PER_STABILIZER,
          price: p(40),
          exclusiveWith: ["full-stabilizer-service"],
        },
      ],
    },
    {
      name: "Build & Soldering Services",
      slug: "build-soldering",
      device: Device.KEYBOARD,
      sortOrder: 3,
      services: [
        {
          slug: "solder-switches",
          name: "Solder Switches",
          description: "Clean joints on every pin, 60/40 solder.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(7),
        },
        {
          slug: "desolder-switches",
          name: "Desolder Switches",
          description: "Gentle removal & PCB cleanup, no damage.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(12),
        },
        {
          slug: "keyboard-build-60-65",
          name: "60–65% Keyboard Build",
          description: "Full assembly + solder, tested and tuned.",
          unit: ServiceUnit.FLAT,
          priceMin: p(500),
          priceMax: p(550),
          priceLabel: "₹500–550",
          sortOrder: 3,
        },
        {
          slug: "keyboard-build-tkl",
          name: "TKL Keyboard Build",
          description: "Full tenkeyless assembly with quality verification.",
          unit: ServiceUnit.FLAT,
          priceMin: p(650),
          priceMax: p(800),
          priceLabel: "₹650–800",
          sortOrder: 4,
        },
        {
          slug: "millmax-socket-install",
          name: "Millmax Socket Install",
          description: "Precision hotswap conversion.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(18),
          priceLabel: "₹18/SK",
          sortOrder: 5,
        },
        {
          slug: "hotswap-socket-install",
          name: "Hotswap Socket Install / Replace",
          description: "New install or damaged socket replacement.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(13),
          priceLabel: "₹13/SK",
          sortOrder: 6,
        },
        {
          slug: "split-keyboard-build",
          name: "Split Keyboard Build",
          description: "Custom ergonomic split assembly & wiring.",
          unit: ServiceUnit.QUOTE,
          sortOrder: 7,
        },
        {
          slug: "pcb-troubleshooting-repair",
          name: "PCB Troubleshooting & Repair",
          description: "Trace shorts, dead keys, component faults.",
          unit: ServiceUnit.QUOTE,
          sortOrder: 8,
        },
      ],
    },
    {
      name: "Custom PCB & Keyboard Design",
      slug: "custom-pcb-design",
      device: Device.KEYBOARD,
      sortOrder: 4,
      services: [
        {
          slug: "custom-pcb-design-layout",
          name: "Custom PCB Design & Layout",
          description: "Schematic to routed, DRC-verified layout.",
          unit: ServiceUnit.QUOTE,
        },
        {
          slug: "pcb-fabrication-support",
          name: "PCB Fabrication Support",
          description: "Gerber files, sourcing & assembly coordination.",
          unit: ServiceUnit.QUOTE,
        },
        {
          slug: "full-custom-keyboard-build",
          name: "Full Custom Keyboard Build",
          description: "Case + PCB + stabs + switches + keycaps, bespoke.",
          unit: ServiceUnit.QUOTE,
        },
        {
          slug: "firmware-upload-testing",
          name: "Firmware Upload & Testing",
          description: "QMK/ZMK flashing & full key verification.",
          unit: ServiceUnit.QUOTE,
        },
        {
          slug: "general-electronics-repair",
          name: "General Electronics Repair",
          description: "Component-level diagnosis & repair.",
          unit: ServiceUnit.QUOTE,
        },
      ],
    },
    {
      name: "Mouse Switch Services",
      slug: "mouse-switch-services",
      device: Device.MOUSE,
      sortOrder: 1,
      services: [
        {
          slug: "switch-swap",
          name: "Switch Swap (Left / Right Click)",
          description: "Replace worn, double-clicking, or mushy main switches — bring your own switches or ask us to source.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(100),
        },
        {
          slug: "middle-side-switch-swap",
          name: "Middle / Side Button Switch Swap",
          description: "Replace scroll-click, forward/back, or DPI switches.",
          unit: ServiceUnit.PER_SWITCH,
          price: p(80),
        },
      ],
    },
    {
      name: "Mouse Mods & Repairs",
      slug: "mouse-mods-repairs",
      device: Device.MOUSE,
      sortOrder: 2,
      services: [
        {
          slug: "tape-mod",
          name: "Tape Mod",
          description: "Internal shell taping to reduce flex, rattle, and hollow acoustics.",
          unit: ServiceUnit.FLAT,
          price: p(300),
        },
        {
          slug: "skate-feet-replacement",
          name: "Skate / Feet Replacement",
          description: "Fresh PTFE skates fitted and leveled.",
          unit: ServiceUnit.FLAT,
          price: p(150),
        },
        {
          slug: "encoder-replacement",
          name: "Encoder Replacement (Scroll Wheel)",
          description: "Fix inconsistent, skipping, or dead scroll — encoder sourced to match your model.",
          unit: ServiceUnit.QUOTE,
          sortOrder: 3,
        },
        {
          slug: "mouse-diagnostics-repair",
          name: "General Mouse Diagnostics & Repair",
          description: "Cable, sensor, button, or connectivity issues.",
          unit: ServiceUnit.QUOTE,
          sortOrder: 4,
        },
      ],
    },
  ];

  for (const group of groups) {
    const { services, ...groupData } = group;
    await prisma.serviceGroup.upsert({
      where: { slug: groupData.slug },
      update: groupData,
      create: groupData,
    });
    const dbGroup = await prisma.serviceGroup.findUniqueOrThrow({ where: { slug: groupData.slug } });
    for (const svc of services) {
      await prisma.service.upsert({
        where: { slug: svc.slug },
        update: { ...svc, groupId: dbGroup.id, device: groupData.device },
        create: { ...svc, groupId: dbGroup.id, device: groupData.device },
      });
    }
  }

  // ─── Shop categories ───────────────────────────────────────────────────────
  const categories = [
    { name: "Keyboards", slug: "keyboards", description: "Prebuilt and DIY mechanical keyboards.", sortOrder: 1 },
    { name: "Mice", slug: "mice", description: "Gaming and productivity mice.", sortOrder: 2 },
    { name: "Switches", slug: "switches", description: "Mechanical switches for every feel.", sortOrder: 3 },
    { name: "Keycaps", slug: "keycaps", description: "Keycap sets and accent kits.", sortOrder: 4 },
    { name: "Stabilizers", slug: "stabilizers", description: "Stabilizer kits and tuning supplies.", sortOrder: 5 },
    { name: "PCBs", slug: "pcbs", description: "Keyboard PCBs and kits.", sortOrder: 6 },
    { name: "Cases", slug: "cases", description: "Cases and plates.", sortOrder: 7 },
    { name: "Cables", slug: "cables", description: "Coiled and custom cables.", sortOrder: 8 },
    { name: "Accessories", slug: "accessories", description: "Tools, films, lube and more.", sortOrder: 9 },
  ];
  for (const c of categories) {
    await prisma.category.upsert({ where: { slug: c.slug }, update: c, create: c });
  }

  // ─── Brands & demo product catalogue ───────────────────────────────────────
  // Placeholder product images reuse the work-gallery files; replace from the
  // admin (Cloudinary) once credentials are configured.
  const brands = [
    { name: "Keychron", slug: "keychron", website: "https://www.keychron.com" },
    { name: "Varmilo", slug: "varmilo", website: "https://www.varmilo.com" },
    { name: "Gateron", slug: "gateron", website: "https://www.gateron.com" },
    { name: "Durock", slug: "durock", website: null },
    { name: "GMK", slug: "gmk", website: null },
    { name: "Akko", slug: "akko", website: "https://www.akkogear.com" },
    { name: "Razer", slug: "razer", website: "https://www.razer.com" },
    { name: "Logitech", slug: "logitech", website: "https://www.logitech.com" },
  ];
  for (const b of brands) {
    await prisma.brand.upsert({ where: { slug: b.slug }, update: b, create: b });
  }

  const products: {
    name: string;
    slug: string;
    type: ProductType;
    categorySlug: string;
    brandSlug: string;
    shortDescription: string;
    price: number;
    compareAtPrice?: number;
    costPrice?: number;
    stock: number;
    gstRate: number;
    featured?: boolean;
    popular?: boolean;
    isNew?: boolean;
    features: string[];
    whatsIncluded: string[];
    specifications: Record<string, string>;
    image: string;
  }[] = [
    {
      name: "Keychron Q1 HE 75% Hot-Swap Keyboard",
      slug: "keychron-q1-he-75-hotswap",
      type: ProductType.KEYBOARD,
      categorySlug: "keyboards",
      brandSlug: "keychron",
      shortDescription: "Premium aluminium gasket-mount 75% board with Hall-effect switches and QMK support.",
      price: p(23999),
      compareAtPrice: p(26999),
      costPrice: p(19500),
      stock: 8,
      gstRate: 18,
      featured: true,
      popular: true,
      isNew: true,
      features: ["Aluminium CNC case, gasket mount", "Hall-effect magnetic switches", "QMK / VIA support out of the box", "South-facing RGB, PBT double-shot keycaps"],
      whatsIncluded: ["Keyboard with pre-installed switches", "Coiled USB-C cable", "Keycap puller, switch puller", "Extra magnetic switches (4)"],
      specifications: { "Layout": "75%", "Mount": "Gasket", "Case": "Aluminium CNC", "Connectivity": "USB-C wired", "Hot-swap": "Yes" },
      image: "/images/work/sample-04.webp",
    },
    {
      name: "Varmilo VA108 Custom Mechanical Keyboard",
      slug: "varmilo-va108-custom",
      type: ProductType.KEYBOARD,
      categorySlug: "keyboards",
      brandSlug: "varmilo",
      shortDescription: "Full-size keyboard with Varmilo's signature electrostatic-capacitive switches and dye-sub keycaps.",
      price: p(18999),
      costPrice: p(15200),
      stock: 4,
      gstRate: 18,
      features: ["EC (electrostatic capacitive) switches", "Full-size 108-key layout", "Dye-sub PBT keycaps", "USB-C, dual-mode (wired + Bluetooth)"],
      whatsIncluded: ["Keyboard", "USB-C cable", "Keycap puller", "Dust cover"],
      specifications: { "Layout": "Full-size (108)", "Switch": "Varmilo EC V2", "Keycaps": "Dye-sub PBT", "Connectivity": "Wired + BT 5.1" },
      image: "/images/work/sample-03.webp",
    },
    {
      name: "Gateron Milky Yellow Pro Switches (x70)",
      slug: "gateron-milky-yellow-pro-x70",
      type: ProductType.SWITCH,
      categorySlug: "switches",
      brandSlug: "gateron",
      shortDescription: "Smooth linear switches with a satisfying 50gf bottom-out — a budget favourite for thocky builds.",
      price: p(2100),
      compareAtPrice: p(2600),
      costPrice: p(1600),
      stock: 42,
      gstRate: 12,
      featured: true,
      popular: true,
      features: ["Linear, 50gf bottom-out", "Milky translucent housing", "Factory-lubed", "5-pin PCB mount"],
      whatsIncluded: ["70 switches", "Switch puller"],
      specifications: { "Type": "Linear", "Actuation": "50gf", "Travel": "4.0mm", "Mount": "5-pin" },
      image: "/images/work/sample-02.webp",
    },
    {
      name: "Durock POM Linear Switches (x90)",
      slug: "durock-pom-linear-x90",
      type: ProductType.SWITCH,
      categorySlug: "switches",
      brandSlug: "durock",
      shortDescription: "All-POM linear switches with an ultra-smooth upstroke, perfect for lubing.",
      price: p(3200),
      costPrice: p(2500),
      stock: 25,
      gstRate: 12,
      isNew: true,
      features: ["All-POM housing", "Ultra-smooth linear travel", "Great with 205g0 lubing", "5-pin PCB mount"],
      whatsIncluded: ["90 switches"],
      specifications: { "Type": "Linear", "Actuation": "45gf", "Travel": "3.6mm", "Mount": "5-pin" },
      image: "/images/work/sample-02.webp",
    },
    {
      name: "GMK Laser Keycap Set",
      slug: "gmk-laser-keycap-set",
      type: ProductType.KEYCAP,
      categorySlug: "keycaps",
      brandSlug: "gmk",
      shortDescription: "Double-shot ABS keycaps in the iconic synthwave colourway. Full TKL + numpad coverage.",
      price: p(14999),
      costPrice: p(12500),
      stock: 3,
      gstRate: 12,
      featured: true,
      features: ["Double-shot ABS, cherry profile", "Synthwave colourway with novelties", "Full TKL + numpad coverage", "Legends that never fade"],
      whatsIncluded: ["Base kit (TKL + numpad)", "Novelty kit"],
      specifications: { "Profile": "Cherry", "Material": "Double-shot ABS", "Coverage": "TKL + numpad" },
      image: "/images/work/sample-05.webp",
    },
    {
      name: "Akko Macaron Keycap Set (ASA Profile)",
      slug: "akko-macaron-keycap-set",
      type: ProductType.KEYCAP,
      categorySlug: "keycaps",
      brandSlug: "akko",
      shortDescription: "Soft pastel PBT keycaps in Akko's sculpted ASA profile with full 1800 layout coverage.",
      price: p(4999),
      costPrice: p(3800),
      stock: 18,
      gstRate: 12,
      isNew: true,
      features: ["PBT, dye-sub printed", "Sculpted ASA profile", "1800 layout coverage", "Macaron pastel colourway"],
      whatsIncluded: ["Full keycap set", "Keycap puller"],
      specifications: { "Profile": "ASA", "Material": "PBT dye-sub", "Coverage": "1800 layout" },
      image: "/images/work/sample-05.webp",
    },
    {
      name: "Durock Screw-In Stabilizer Kit (7u)",
      slug: "durock-screw-in-stabilizer-kit",
      type: ProductType.STABILIZER,
      categorySlug: "stabilizers",
      brandSlug: "durock",
      shortDescription: "Precision screw-in stabilizers with gold-plated wires — the staple of quiet, rattle-free spacebars.",
      price: p(899),
      costPrice: p(620),
      stock: 30,
      gstRate: 12,
      features: ["Screw-in mount for solid stabilisation", "Gold-plated wires", "Pre-greased housings", "1x 7u spacebar kit"],
      whatsIncluded: ["2x 2u stabilizers", "1x 7u spacebar stabilizer", "Screws + washers", "Wire puller"],
      specifications: { "Kit": "2x 2u + 1x 7u", "Mount": "Screw-in", "Wire": "Gold-plated" },
      image: "/images/work/sample-01.webp",
    },
    {
      name: "Razer Viper V3 Pro Wireless Mouse",
      slug: "razer-viper-v3-pro",
      type: ProductType.MOUSE,
      categorySlug: "mice",
      brandSlug: "razer",
      shortDescription: "Ultra-light 54g esports mouse with the 30K optical sensor and 90h battery life.",
      price: p(13499),
      compareAtPrice: p(15999),
      costPrice: p(11000),
      stock: 6,
      gstRate: 18,
      featured: true,
      popular: true,
      features: ["54g ultra-lightweight design", "Focus Pro 30K optical sensor", "90-hour battery life", "8K Hz HyperPolling ready"],
      whatsIncluded: ["Mouse", "2.4GHz dongle + receiver dock", "USB-C charging cable", "PTFE feet + grip tape"],
      specifications: { "Weight": "54g", "Sensor": "Focus Pro 30K", "Battery": "90h", "Polling": "8K Hz" },
      image: "/images/work/sample-06.webp",
    },
    {
      name: "Logitech G502 X Wired Gaming Mouse",
      slug: "logitech-g502-x",
      type: ProductType.MOUSE,
      categorySlug: "mice",
      brandSlug: "logitech",
      shortDescription: "The legendary G502 with lighter weight, LIGHTFORCE hybrid switches and a 25K HERO sensor.",
      price: p(8999),
      compareAtPrice: p(10999),
      costPrice: p(7200),
      stock: 12,
      gstRate: 18,
      features: ["LIGHTFORCE hybrid optical-mechanical switches", "HERO 25K sensor", "Adjustable weights (0–16g)", "13 programmable controls"],
      whatsIncluded: ["Mouse", "USB-C cable", "Weight kit"],
      specifications: { "Weight": "89g", "Sensor": "HERO 25K", "Switch": "LIGHTFORCE", "Buttons": "13" },
      image: "/images/work/sample-06.webp",
    },
    {
      name: "Krytox 205g0 Switch Lubricant (2ml)",
      slug: "krytox-205g0-2ml",
      type: ProductType.LUBRICANT,
      categorySlug: "accessories",
      brandSlug: null as unknown as string,
      shortDescription: "The community-standard switch lubricant for smooth, buttery linear travel.",
      price: p(650),
      costPrice: p(420),
      stock: 60,
      gstRate: 12,
      popular: true,
      features: ["2ml syringe of genuine Krytox GPL 205g0", "Thick, long-lasting lube", "Perfect for linears and stabilizers", "Food-safe grade 0 grease"],
      whatsIncluded: ["1x 2ml syringe", "Applicator brush"],
      specifications: { "Size": "2ml", "Grade": "GPL 205g0", "Type": "Grease" },
      image: "/images/work/sample-01.webp",
    },
    {
      name: "KeebForge Coiled Aviator Cable (USB-C)",
      slug: "keebforge-coiled-aviator-cable",
      type: ProductType.CABLE,
      categorySlug: "cables",
      brandSlug: null as unknown as string,
      shortDescription: "Hand-made coiled cable with a detachable aviator connector, custom length and colour.",
      price: p(1799),
      costPrice: p(1100),
      stock: 0,
      gstRate: 18,
      features: ["Hand-coiled in-house", "Detachable GX16 aviator connector", "Custom lengths and colours", "Braided, double-sleeved"],
      whatsIncluded: ["Coiled cable (device end)", "Straight cable (host end)", "Cable strap"],
      specifications: { "Connector": "USB-C", "Coil": "5–7 turns", "Length": "Custom" },
      image: "/images/work/sample-03.webp",
    },
  ];

  for (const pr of products) {
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: pr.categorySlug } });
    const brand = pr.brandSlug ? await prisma.brand.findUnique({ where: { slug: pr.brandSlug } }) : null;
    const data = {
      name: pr.name,
      slug: pr.slug,
      type: pr.type,
      categoryId: category.id,
      brandId: brand?.id ?? null,
      shortDescription: pr.shortDescription,
      features: { list: pr.features } as Prisma.InputJsonValue,
      whatsIncluded: { list: pr.whatsIncluded } as Prisma.InputJsonValue,
      specifications: pr.specifications as Prisma.InputJsonValue,
      price: pr.price,
      compareAtPrice: pr.compareAtPrice ?? null,
      costPrice: pr.costPrice ?? null,
      stock: pr.stock,
      lowStockThreshold: 5,
      gstRate: pr.gstRate,
      allowBackorders: true,
      inventoryTracking: true,
      featured: pr.featured ?? false,
      popular: pr.popular ?? false,
      isNew: pr.isNew ?? false,
      status: pr.stock > 0 ? ProductStatus.ACTIVE : ProductStatus.OUT_OF_STOCK,
      active: pr.stock > 0,
      seoTitle: `${pr.name} | KeebForge Shop`,
      seoDescription: pr.shortDescription,
      canonicalUrl: `https://keebforge.in/product/${pr.slug}`,
    };
    await prisma.product.upsert({ where: { slug: pr.slug }, update: data, create: data });
    const dbProduct = await prisma.product.findUniqueOrThrow({ where: { slug: pr.slug } });
    const existingImg = await prisma.productImage.findUnique({ where: { id: `img:${dbProduct.id}:${pr.image}` } });
    if (!existingImg) {
      await prisma.productImage.create({
        data: { id: `img:${dbProduct.id}:${pr.image}`, productId: dbProduct.id, url: pr.image, alt: pr.name, sortOrder: 0, primary: true, active: true },
      });
    }
  }

  // ─── Site settings ─────────────────────────────────────────────────────────
  const settings: Record<string, unknown> = {
    "site.name": "KeebForge.in",
    "site.tagline": "Mechanical Keyboard & Mouse Services",
    "site.description":
      "Mechanical keyboard & gaming mouse repair across India — switch lubing, stabilizer tuning, soldering, PCB repair & custom builds. Mail-in service from anywhere in India.",
    "contact.email": "contact@keebforge.in",
    "contact.discord": "https://discord.com/users/843113968734437376",
    "contact.discordHandle": "hardy_022",
    "contact.instagram": "https://www.instagram.com/nowitshardik/",
    "contact.reddit": "https://www.reddit.com/user/hardy_022/",
    "contact.portfolio": "https://portfolio.shadow269.in/",
    "location.region": "IN-JK",
    "location.place": "Jammu & Kashmir",
    "shipping.model": "Mail-in service across India. Ship your device to us from anywhere in India and we ship it back after the work is completed.",
    "shipping.terms": "Buyer covers shipping costs in both directions.",
    "acceptingOrders": true,
    "turnaround": "5–7 days depending on order complexity and queue.",
    "payment.terms": "Payment before work begins — it books any parts needed and secures your order.",
    "analytics.umamiId": "db504642-e075-4a18-9da3-02f971af33c5",
    "seo.organizationJsonLd": {
      "@type": "Organization",
      name: "KeebForge.in",
      url: "https://keebforge.in/",
      logo: "https://keebforge.in/favicon.png",
      email: "contact@keebforge.in",
      foundingLocation: { addressLocality: "Jammu and Kashmir", addressCountry: "IN" },
      areaServed: { "@type": "Country", name: "India" },
    },
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.siteSetting.upsert({ where: { key }, update: { value: value as Prisma.InputJsonValue }, create: { key, value: value as Prisma.InputJsonValue } });
  }

  // ─── Reviews (migrated from static.keebforge.in/assets/js/reviews.js) ─────
  const reviews = [
    { name: "Shadow", location: "Managluru", rating: 5, service: "Switch Lubing & Spring Swap", date: "Apr 2026", text: "Got all 80 switches lubed and spring-swapped. The difference is night and day — absolutely buttery and no more wobble. Turnaround was quick and packaging was solid. Highly recommend." },
    { name: "kaezr", location: "Bangalore", rating: 4, service: "Keyboard Build", date: "June 2026", text: "got my first split keyboard from them, the led stopped working when i got it first but he repaired it for free. Overall I am happy with the product." },
    { name: "Bacon Ball", location: "", rating: 5, service: "Keyboard Build", date: "July 2026", text: "really a great guy and I am absolutely loving his build. He went over all the details and made absolutely clear each every aspect of the build and provided good options for it as well. He also kept me updated during each segment of the build. If I had to build a keyboard again I would definitely choose him." },
    { name: "DeLTa", location: "", rating: 5, service: "Soldering Work", date: "July 2026", text: "Best guy for a clean soldering work on the hoshizora pcb" },
    { name: "Muzammil", location: "", rating: 5, service: "Mouse Repair", date: "August 2026", text: "I'm very satisfied with the service. He kept me updated on every step and even handled the shipping. The repair was really quick and the price was very reasonable. Overall really happy with the service" },
    { name: "Thockblock", location: "", rating: 5, service: "Keyboard Build", date: "August 2026", text: "got a num pad and 2 macro pads built from him, from getting all the parts to getting the right colour acrylic sheets, he was very easy to work with even added the screen for free, would recommend anytime of the day" },
    { name: "bayernlad", location: "", rating: 4, service: "Soldering Work", date: "August 2026", text: "millmaxed neo60 core pcb. It works well. He is very accommodating with requests and goes out of his way." },
  ];

  const admin = await prisma.profile.upsert({
    where: { email: "shadow@keebforge.in" },
    update: { role: Role.ADMIN },
    create: { id: "seed-admin", email: "shadow@keebforge.in", name: "KeebForge Owner", role: Role.ADMIN },
  });

  const MONTHS: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const parseDate = (d: string) => {
    const [mon, yr] = d.split(" ");
    return new Date(Number(yr), MONTHS[mon] ?? 0, 1);
  };

  for (const r of reviews) {
    await prisma.review.upsert({
      where: { id: `seed-review-${r.name.toLowerCase().replace(/\s+/g, "-")}` },
      update: {
        rating: r.rating,
        body: r.text,
        verified: true,
        status: ReviewStatus.APPROVED,
        type: ReviewType.SERVICE,
        authorName: r.name,
        authorLocation: r.location || null,
        serviceLabel: r.service,
        date: parseDate(r.date),
      },
      create: {
        id: `seed-review-${r.name.toLowerCase().replace(/\s+/g, "-")}`,
        profileId: admin.id,
        type: ReviewType.SERVICE,
        rating: r.rating,
        body: r.text,
        verified: true,
        status: ReviewStatus.APPROVED,
        authorName: r.name,
        authorLocation: r.location || null,
        serviceLabel: r.service,
        date: parseDate(r.date),
      },
    });
  }

  // ─── Work portfolio (from homepage gallery) ────────────────────────────────
  const work = [
    { title: "Split Keyboard Repair", slug: "split-keyboard-repair", description: "Diagnosed and repaired a split keyboard — full PCB fault isolation and component-level fix.", category: "REPAIR", image: "/images/work/sample-01.webp" },
    { title: "Switch Service", slug: "switch-service", description: "Complete switch service — lubed, filmed and spring-swapped to a buttery, thocky finish.", category: "MOD", image: "/images/work/sample-02.webp" },
    { title: "Split Keyboard Build", slug: "split-keyboard-build", description: "Custom split keyboard assembled from parts — wiring, firmware and full testing included.", category: "CUSTOM_BUILD", image: "/images/work/sample-03.webp" },
    { title: "Full Builds", slug: "full-builds", description: "Complete builds assembled, soldered and tuned to the customer's spec.", category: "CUSTOM_BUILD", image: "/images/work/sample-04.webp" },
    { title: "PCB & Firmware Troubleshooting", slug: "pcb-firmware-troubleshooting", description: "Traced and resolved firmware and PCB faults, restored the board to fully working order.", category: "PCB", image: "/images/work/sample-05.webp" },
    { title: "PCB Testing", slug: "pcb-testing", description: "Verification and quality testing of PCBs before final assembly.", category: "PCB", image: "/images/work/sample-06.webp" },
  ];

  const catMap: Record<string, string> = {
    REPAIR: "REPAIR",
    MOD: "MOD",
    CUSTOM_BUILD: "CUSTOM_BUILD",
    PCB: "PCB",
  };

  for (const w of work) {
    await prisma.workProject.upsert({
      where: { slug: w.slug },
      update: {
        title: w.title,
        description: w.description,
        category: catMap[w.category] as never,
        images: [{ url: w.image, alt: w.title }],
        active: true,
        featured: true,
      },
      create: {
        slug: w.slug,
        title: w.title,
        description: w.description,
        category: catMap[w.category] as never,
        images: [{ url: w.image, alt: w.title }],
        active: true,
        featured: true,
      },
    });
  }

  console.log("Seed complete ✔");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });