/** Top-level app folder in Cloudinary — everything we upload lives under it. */
export const IMAGE_ROOT = "keebforge";

/** True when a public id belongs to this app's own Cloudinary subtree. */
export function isAppAsset(publicId: string): boolean {
  return publicId.startsWith(`${IMAGE_ROOT}/`);
}