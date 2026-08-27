import "server-only";
import { v2 as cloudinary } from "cloudinary";

const configured = Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

export function cloudinaryConfigured() {
  return configured;
}

if (configured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

/** Top-level app folder in Cloudinary — everything we upload lives under it. */
const ROOT = "keebforge";

// ponytail: repair/order/customer assets are uploaded public but unlisted —
// access is "know the opaque id" (cuid / order number), matching the current
// email-the-links model. If they must become truly private, add an
// auth-gated streaming proxy (/api/media/[id] → requireUser + ownership check)
// and switch delivery URLs to it; folder scheme and Media rows stay as-is.

/**
 * Server-decided folder per entity + role. The client never picks folders.
 * Products use their stable cuid (survives slug renames); repairs/orders use
 * their business ids. Never customer names/emails/phones.
 */
export function mediaFolder(entityType: "PRODUCT" | "REPAIR" | "ORDER", entityId: string, role?: string): string {
  switch (entityType) {
    case "PRODUCT": {
      // Drafts (new-product editor, before the row exists) get a staging folder
      // and are renamed into keebforge/products/{id} on save.
      if (role === "DRAFT") return `${ROOT}/products/drafts/${entityId}`;
      return `${ROOT}/products/${entityId}`;
    }
    case "REPAIR":
      return `${ROOT}/repairs/${entityId}`;
    case "ORDER":
      return `${ROOT}/orders/${entityId}`;
  }
}

/** Repair sub-folder for a role, e.g. keebforge/repairs/{id}/before. */
export function repairRoleFolder(repairId: string, role: string): string {
  const norm = role.toLowerCase().replace(/_/g, "-");
  const sub = ["before", "after", "diagnostic", "work", "final", "customer-upload"].includes(norm)
    ? norm
    : "other";
  return `${mediaFolder("REPAIR", repairId)}/${sub}`;
}

export type UploadedImage = { url: string; publicId: string; width: number; height: number };

/** Upload an image buffer to an explicit Cloudinary folder. */
export function uploadBuffer(buffer: Buffer, opts: { folder: string; publicId?: string }): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: opts.folder,
        ...(opts.publicId ? { public_id: `${opts.folder}/${opts.publicId}`, invalidate: true } : {}),
        resource_type: "image",
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed."));
        resolve({ url: result.secure_url, publicId: result.public_id, width: result.width ?? 0, height: result.height ?? 0 });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Delete a Cloudinary asset by public id. Never throws — returns whether the
 * asset was actually destroyed so callers can log orphans instead of lying.
 */
export async function deleteImage(publicId: string): Promise<boolean> {
  try {
    const res = await cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true });
    if (res.result !== "ok") {
      console.error(`[cloudinary] destroy not ok for ${publicId}:`, res.result);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[cloudinary] destroy failed for ${publicId}:`, e);
    return false;
  }
}

/** Move an asset between folders (draft → final product folder). */
export async function renameAsset(fromPublicId: string, toPublicId: string): Promise<UploadedImage | null> {
  try {
    const res = await cloudinary.uploader.rename(fromPublicId, toPublicId, { resource_type: "image", invalidate: true });
    return { url: res.secure_url, publicId: res.public_id, width: res.width ?? 0, height: res.height ?? 0 };
  } catch (e) {
    console.error(`[cloudinary] rename failed ${fromPublicId} -> ${toPublicId}:`, e);
    return null;
  }
}

export { cldUrl } from "./cloudinary-url";
