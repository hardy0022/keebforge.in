import { prisma } from "@/lib/db/prisma";

// One-off data fix (product-seo audit): corne-choc's seoTitle/seoDescription
// were copy-pasted from Corne MX ("Corne MX", "MX-compatible"). Correct them
// to Choc-accurate copy derived from corne-choc's own visible description.
// Transactional + idempotent. No schema change. Run: npx tsx <this file>.
const slug = "corne-choc";
const seoTitle = "Corne Choc 42-Key Low-Profile Split Mechanical Keyboard | KeebForge";
const seoDescription =
  "Build a compact, low-profile setup with the Corne Choc, a 42-key split ergonomic " +
  "mechanical keyboard with programmable layouts and Choc-compatible V1 switches.";

async function main() {
await prisma.$transaction(async (tx) => {
  const before = await tx.product.findUnique({
    where: { slug },
    select: { id: true, seoTitle: true, seoDescription: true },
  });
  if (!before) throw new Error(`product ${slug} not found`);

  const changed =
    before.seoTitle !== seoTitle || before.seoDescription !== seoDescription;

  const after = changed
    ? await tx.product.update({
        where: { slug },
        data: { seoTitle, seoDescription },
        select: { seoTitle: true, seoDescription: true },
      })
    : before;

  console.log(`seo fields ${changed ? "UPDATED" : "already correct"} for ${slug}`);
  console.log("  before title:", before.seoTitle);
  console.log("  after  title:", after.seoTitle);
});

await prisma.$disconnect();
}

main().finally(() => process.exit(0));