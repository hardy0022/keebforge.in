"use client";

import { useState } from "react";
import Image from "next/image";
import { cldUrl } from "@/lib/cloudinary-url";

type WorkSlide = { url: string; alt?: string | null };

/**
 * Work/project image slider. Same arrow/counter visual language as the
 * product gallery (product-gallery-* classes) but always contained: no
 * fullscreen, images object-fit: contain, arrows always visible.
 */
export function WorkImageSlider({ images, projectName }: { images: WorkSlide[]; projectName: string }) {
  const [index, setIndex] = useState(0);
  if (images.length === 0) return null;

  const prev = () => setIndex((i) => (i === 0 ? images.length - 1 : i - 1));
  const next = () => setIndex((i) => (i === images.length - 1 ? 0 : i + 1));

  return (
    <div className="work-gallery product-gallery">
      <div className="product-gallery-main">
        {images.map((img, i) => (
          <Image
            key={i}
            src={cldUrl(img.url, 1200)}
            alt={img.alt ?? projectName}
            fill
            priority={i === 0}
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-contain transition-opacity duration-300"
            style={{ opacity: i === index ? 1 : 0 }}
            aria-hidden={i !== index}
          />
        ))}

        {images.length > 1 && (
          <div className="product-gallery-nav">
            <button className="product-gallery-btn" onClick={prev} aria-label="Previous image">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button className="product-gallery-btn" onClick={next} aria-label="Next image">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}

        {images.length > 1 && (
          <div className="product-gallery-counter" aria-hidden="true">
            {index + 1} / {images.length}
          </div>
        )}
      </div>
    </div>
  );
}