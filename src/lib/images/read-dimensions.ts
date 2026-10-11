/**
 * Server-side (and test-side) image-dimension reader.
 *
 * Decodes the pixel dimensions of the three header-parseable upload formats
 * (JPEG, PNG, WebP) straight from the file bytes — no image library, no
 * decompression. Avif is deliberately not decoded here: its dimensions live in
 * ISO-BMFF boxes and parsing them reliably is out of scope, so AVIF uploads
 * keep the byte-size caps only.
 *
 * The upload paths call this to bound how much a single customer upload can
 * make Cloudinary decode (a decompression bomb bounded by bytes alone), and to
 * reject images whose dimensions exceed real-world consumer photos.
 */

export const MAX_IMAGE_DIM = 8192;

export type ImageDimensions = { width: number; height: number };

function u16be(buf: Uint8Array, at: number): number {
  return (buf[at] << 8) | buf[at + 1];
}

function u32be(buf: Uint8Array, at: number): number {
  return ((buf[at] << 24) | (buf[at + 1] << 16) | (buf[at + 2] << 8) | buf[at + 3]) >>> 0;
}

const SOF_MARKERS = new Set<number>([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 < buf.length) {
    if (buf[i] !== 0xff) return null;
    let marker = buf[i + 1];
    while (marker === 0xff && i + 2 < buf.length) {
      marker = buf[++i + 1];
    }
    if (marker === 0xd9 || marker === 0xda) return null;
    const length = u16be(buf, i + 2);
    if (length < 2) return null;
    if (SOF_MARKERS.has(marker)) {
      if (i + 9 > buf.length) return null;
      const height = u16be(buf, i + 5);
      const width = u16be(buf, i + 7);
      if (width <= 0 || height <= 0) return null;
      return { width, height };
    }
    i += 2 + length;
  }
  return null;
}

function pngDimensions(buf: Uint8Array): ImageDimensions | null {
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24) return null;
  for (let i = 0; i < 8; i++) if (buf[i] !== PNG_SIG[i]) return null;
  if (String.fromCharCode(...buf.subarray(12, 16)) !== "IHDR") return null;
  const width = u32be(buf, 16);
  const height = u32be(buf, 20);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

function webpDimensions(buf: Uint8Array): ImageDimensions | null {
  if (buf.length < 30) return null;
  if (String.fromCharCode(...buf.subarray(0, 4)) !== "RIFF") return null;
  if (String.fromCharCode(...buf.subarray(8, 12)) !== "WEBP") return null;
  const chunk = String.fromCharCode(...buf.subarray(12, 16));
  if (chunk === "VP8 ") {
    // Lossy: keyframe starts with the 9D 01 2A start code at offset 20.
    if (buf[20] !== 0x9d || buf[21] !== 0x01 || buf[22] !== 0x2a) return null;
    const width = 1 + ((buf[23] | (buf[24] << 8)) & 0x3fff);
    const height = 1 + ((buf[25] | (buf[26] << 8)) & 0x3fff);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8L") {
    if (buf[17] !== 0x2f) return null;
    const width =
      1 + (buf[18] | ((buf[19] & 0x3f) << 8) | ((buf[21] & 0x30) << 10));
    const height =
      1 +
      (((buf[19] & 0xc0) >> 6) |
        (buf[20] << 2) |
        ((buf[21] & 0x0c) << 8) |
        ((buf[21] & 0x03) << 14));
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (chunk === "VP8X") {
    // Payload starts at offset 20: byte 20 flags, 21-23 reserved,
    // 24-26 canvas width-1 (LE), 27-29 canvas height-1 (LE).
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return width > 0 && height > 0 ? { width, height } : null;
  }
  return null;
}

/** Decode pixel dimensions from bytes without decoding the image. */
export function readImageDimensions(
  buf: Uint8Array,
): ImageDimensions | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return jpegDimensions(buf);
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return pngDimensions(buf);
  if (
    buf.length >= 12 &&
    String.fromCharCode(...buf.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...buf.subarray(8, 12)) === "WEBP"
  )
    return webpDimensions(buf);
  return null; // avif (or a format we do not dimension-check)
}