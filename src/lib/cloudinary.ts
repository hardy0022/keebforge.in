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

export type UploadedImage = { url: string; publicId: string; width: number; height: number };

export function uploadBuffer(buffer: Buffer, folder = "keebforge/products"): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: "image" },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error("Upload failed."));
        resolve({ url: result.secure_url, publicId: result.public_id, width: result.width ?? 0, height: result.height ?? 0 });
      }
    );
    stream.end(buffer);
  });
}