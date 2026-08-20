// One-time asset optimizer — strips EXIF (incl. GPS), resizes and converts to
// WebP. Run: npm run assets:optimize
import sharp from "sharp";
import { readdir, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const workDir = join(root, "public/images/work");
const files = (await readdir(workDir)).filter((f) => f.endsWith(".jpg"));

for (const f of files) {
  const src = join(workDir, f);
  const out = join(workDir, f.replace(/\.jpg$/, ".webp"));
  await sharp(src).rotate().resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 78 }).toFile(out);
  await rm(src, { force: true }); // originals carry EXIF GPS; do not keep them
  console.log(`optimized ${f} -> ${f.replace(/\.jpg$/, ".webp")}`);
}

// Favicon -> sensible sizes
const favicon = join(root, "public/favicon.png");
const faviconTmp = join(root, "public/.favicon-orig.png");
await sharp(favicon).png().toFile(faviconTmp);
await sharp(faviconTmp).resize(512, 512).png().toFile(favicon);
await sharp(faviconTmp).resize(192, 192).png().toFile(join(root, "public/icon-192.png"));
await sharp(faviconTmp).resize(32, 32).png().toFile(join(root, "public/icon-32.png"));
await rm(faviconTmp, { force: true });
console.log("favicon resized to 512/192/32px");

// Banner -> 1200w webp for OG
await sharp(join(root, "public/images/banner.png")).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 82 }).toFile(join(root, "public/images/banner.webp"));
console.log("banner.webp generated");

console.log("Done. EXIF stripped and images converted to WebP.");