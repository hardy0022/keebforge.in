/**
 * Client-safe image-upload validation shared by every upload path (admin
 * uploads API, repair intake, contact inquiry). No secrets, no server deps.
 */

export const IMAGE_ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;

const ALLOWED_MIME = new Set<string>(IMAGE_ACCEPT);

/** Magic-byte sniff — never trust the browser-reported MIME type alone. */
export function sniffImageType(buf: Uint8Array): "jpeg" | "png" | "webp" | "avif" | null {
  const tag = (from: number, to: number) => String.fromCharCode(...buf.subarray(from, to));
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  )
    return "png";
  if (buf.length >= 12 && tag(0, 4) === "RIFF" && tag(8, 12) === "WEBP")
    return "webp";
  // ISO-BMFF: bytes 4-7 are "ftyp", 8-11 the major brand (avif/avis/mif1)
  if (buf.length >= 12 && tag(4, 8) === "ftyp") {
    const brand = tag(8, 12);
    if (brand === "avif" || brand === "avis" || brand === "mif1") return "avif";
  }
  return null;
}

/** Client-side guard: sniff the first bytes of a picked File (works on iOS/Android gallery picks). */
export async function sniffImageFile(file: File): Promise<boolean> {
  const head = new Uint8Array(await new Response(file.slice(0, 16)).arrayBuffer());
  return sniffImageType(head) !== null;
}

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_MIME.has(mime);
}

export const IMAGE_TYPES_MESSAGE = "Only JPG, PNG, WebP and AVIF images are supported.";
