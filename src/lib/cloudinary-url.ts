/**
 * Client-safe Cloudinary delivery-URL helper (NO credentials — safe to import
 * anywhere). The server-only counterpart lives in src/lib/cloudinary.ts.
 */
export function cldUrl(url: string, width?: number): string {
  const marker = "/image/upload/";
  const at = url.indexOf(marker);
  if (at === -1) return url;
  const transform = `f_auto,q_auto${width ? `,w_${width}` : ""}`;
  return `${url.slice(0, at + marker.length)}${transform}/${url.slice(at + marker.length)}`;
}
