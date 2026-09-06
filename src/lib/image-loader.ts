"use client";

import { cldUrl } from "./cloudinary-url";

type ImageLoaderArgs = { src: string; width: number; quality?: number };

// Custom next/image loader (wired via images.loaderFile). Cloudinary owns every
// uploaded image, so those URLs go straight back out — the browser fetches the
// transformed file from Cloudinary's CDN (f_auto,q_auto,w_N) instead of routing
// bytes through Vercel. Local /public assets pass through as-is: they're
// pre-optimized (see public/hero-background.webp) and the built-in optimizer
// endpoint isn't mounted when a custom loader is configured.
export default function cldImageLoader({ src, width }: ImageLoaderArgs): string {
  if (src.startsWith("https://res.cloudinary.com/")) return cldUrl(src, width);
  return src;
}