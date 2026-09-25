"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import type { ShopProduct } from "@/lib/catalog/data";

interface ProductGalleryProps {
  images: ShopProduct["images"];
  productName: string;
  variantImages?: ShopProduct["images"];
}

export function ProductGallery({
  images,
  productName,
  variantImages,
}: ProductGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // The initial (LCP) image renders at full opacity with no transition so it
  // can paint immediately; gallery transitions only begin after the customer
  // actually switches images, and even then they are short (150ms).
  const [interacted, setInteracted] = useState(false);

  const allImages = variantImages?.length ? variantImages : images;
  const currentImage = allImages[selectedIndex];

  const select = useCallback(
    (i: number) => {
      setSelectedIndex(((i % allImages.length) + allImages.length) % allImages.length);
      setInteracted(true);
    },
    [allImages.length],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      if (e.key === "ArrowLeft") {
        select(selectedIndex - 1);
      } else if (e.key === "ArrowRight") {
        select(selectedIndex + 1);
      } else if (e.key === "Escape") {
        setIsFullscreen(false);
      }
    },
    [isFullscreen, select, selectedIndex],
  );

  useEffect(() => {
    if (isFullscreen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isFullscreen, handleKeyDown]);

  const nextImage = () => select(selectedIndex + 1);
  const prevImage = () => select(selectedIndex - 1);

  if (allImages.length === 0) {
    return (
      <div
        className="product-gallery"
        role="img"
        aria-label="No product image available"
      >
        <div className="product-gallery-fallback" aria-hidden="true">
          {productName.charAt(0).toUpperCase()}
        </div>
      </div>
    );
  }

  const fadeCls = interacted ? "transition-opacity duration-150" : "";

  return (
    <div className="product-gallery">
      <div
        className="product-gallery-main"
        onClick={() => setIsFullscreen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsFullscreen(true);
          }
        }}
        aria-label="View fullscreen"
      >
        {allImages.map((img, i) => (
          <Image
            key={i}
            src={img.url}
            alt={img.alt ?? productName}
            fill
            priority={i === 0}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className={`object-cover ${fadeCls}`}
            style={{ opacity: i === selectedIndex ? 1 : 0 }}
            aria-hidden={i !== selectedIndex}
          />
        ))}
        {allImages.length > 1 && (
          <div className="product-gallery-nav">
            <button
              className="product-gallery-btn"
              onClick={(e) => {
                e.stopPropagation();
                prevImage();
              }}
              aria-label="Previous image"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              className="product-gallery-btn"
              onClick={(e) => {
                e.stopPropagation();
                nextImage();
              }}
              aria-label="Next image"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        )}
        {allImages.length > 1 && (
          <div className="product-gallery-counter" aria-hidden="true">
            {selectedIndex + 1} / {allImages.length}
          </div>
        )}
      </div>

      {allImages.length > 1 && (
        <div className="product-gallery-thumbs" aria-label="Product images">
          {allImages.map((img, i) => (
            <button
              key={i}
              type="button"
              className={`product-gallery-thumb${i === selectedIndex ? " selected" : ""}`}
              aria-label={`Show image ${i + 1} of ${allImages.length}`}
              aria-current={i === selectedIndex ? "true" : undefined}
              onClick={() => select(i)}
            >
              <Image
                src={img.url}
                alt=""
                fill
                sizes="96px"
                loading="lazy"
                className="object-cover"
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      )}

      {isFullscreen && (
        <div
          className="product-gallery-fullscreen"
          onClick={() => setIsFullscreen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen image gallery"
        >
          <button
            className="product-gallery-close"
            onClick={(e) => {
              e.stopPropagation();
              setIsFullscreen(false);
            }}
            aria-label="Close fullscreen"
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <button
            className="product-gallery-btn product-gallery-btn-full product-gallery-btn--prev"
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
            aria-label="Previous image"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <button
            className="product-gallery-btn product-gallery-btn-full product-gallery-btn--next"
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
            aria-label="Next image"
          >
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
          <div className="product-gallery-fullscreen-image">
            <Image
              src={currentImage.url}
              alt={currentImage.alt ?? productName}
              fill
              priority
              sizes="90vw"
              className="object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
