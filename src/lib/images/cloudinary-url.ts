/**
 * Client-safe Cloudinary delivery-URL helper (NO credentials — safe to import
 * anywhere). The server-only counterpart lives in src/lib/images/cloudinary.ts.
 *
 * Single source of transforms: the next/image loader (src/lib/images/loader.ts)
 * applies it with responsive widths, and plain <img> thumbnails call it with
 * fixed widths. c_limit never upscales an original, so small uploads aren't
 * enlarged to fill a srcset width.
 */
export function cldUrl(url: string, width?: number): string {
  const marker = "/image/upload/";
  const at = url.indexOf(marker);
  if (at === -1) return url;
  const transform = `f_auto,q_auto,c_limit${width ? `,w_${width}` : ""}`;
  return `${url.slice(0, at + marker.length)}${transform}/${url.slice(at + marker.length)}`;
}
