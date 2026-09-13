"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";

/**
 * Minimal client island for the shop card's media. Hover swap stays pure CSS
 * (`.shop-card-media:hover`); this only holds the arrow-driven `manual` index
 * that pins an image via inline opacity, released when the pointer leaves.
 */
export function ImageCycler({
  images,
  name,
  slug,
}: {
  images: { url: string; alt: string | null }[];
  name: string;
  slug: string;
}) {
  const count = images.length;
  const [manual, setManual] = useState<number | null>(null);

  const nextImage = () => setManual((m) => ((m ?? 0) + 1) % count);
  const prevImage = () => setManual((m) => ((m ?? 0) - 1 + count) % count);

  return (
    <Link
      href={`/product/${slug}`}
      className="shop-card-media"
      aria-label={name}
      onMouseLeave={() => setManual(null)}
    >
      {/* ponytail: plain layer (no motion/blur entrance) — the listing grid
          mounts up to 24 cards; a fade was invisible below the fold and cost
          main-thread work. Hover swap stays CSS-only. */}
      <div className="absolute inset-0">
        {images.map((img, i) => (
          <Image
            key={i}
            src={img.url}
            alt={img.alt ?? name}
            fill
            sizes="(min-width: 1200px) 25vw, (min-width: 850px) 33vw, (min-width: 600px) 50vw, 100vw"
            className="shop-card-img"
            style={
              manual !== null ? { opacity: i === manual ? 1 : 0 } : undefined
            }
          />
        ))}
      </div>
      {count > 1 && (
        <div className="shop-card-swap">
          <button
            className="shop-card-swap-btn"
            aria-label="Previous image"
            onClick={(e) => {
              e.preventDefault();
              prevImage();
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            className="shop-card-swap-btn"
            aria-label="Next image"
            onClick={(e) => {
              e.preventDefault();
              nextImage();
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      )}
    </Link>
  );
}