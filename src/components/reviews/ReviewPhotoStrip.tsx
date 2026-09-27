"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

/** One photo, or the "+N more" tile. Resolved by ReviewCard (server side) so
 *  only plain data crosses into the client. */
export type ReviewPhotoTile = {
  href: string;
  label: string;
  /** Absent on the "+N more" tile. */
  src?: string;
  more?: boolean;
};

const isOptimizable = (url: string) =>
  url.startsWith("/") || url.startsWith("https://res.cloudinary.com/");

/**
 * Horizontally scrollable strip of a single review's photos, with prev/next
 * arrows. The scrollbar is hidden, so the arrows are the only affordance —
 * they hide themselves when there is nothing left to scroll to, and fade out
 * at each end.
 */
export function ReviewPhotoStrip({
  tiles,
}: {
  tiles: ReviewPhotoTile[];
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(true);

  const syncEdges = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    // Sub-pixel: fractional scrollLeft is common, hence the 1px tolerance.
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= el.scrollWidth - el.clientWidth - 1);
  }, []);

  // A review with 1–2 photos fits outright, so no arrows. Re-measure whenever
  // the strip resizes or the photos finish decoding and change its width.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    syncEdges();
    const ro = new ResizeObserver(syncEdges);
    ro.observe(el);
    for (const img of el.querySelectorAll("img")) {
      if (!img.complete) img.addEventListener("load", syncEdges, { once: true });
    }
    return () => ro.disconnect();
  }, [syncEdges, tiles.length]);

  const scrollByPhotos = (dir: 1 | -1) => {
    const el = stripRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const gap = parseFloat(cs.columnGap) || 0;
    const item = el.firstElementChild as HTMLElement | null;
    // Two photos per click, measured from the DOM so the CSS stays the single
    // source of truth for thumb size and gap.
    const step = ((item?.offsetWidth ?? 120) + gap) * 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * step, behavior: reduce ? "auto" : "smooth" });
  };

  return (
    <div className="review-photos-wrap">
      {/* focusable so the strip is keyboard-scrollable, not just arrow-driven */}
      <div
        className="review-photos"
        ref={stripRef}
        onScroll={syncEdges}
        tabIndex={0}
        role="group"
        aria-label="Review photos, scrollable"
      >
        {tiles.map((t, i) => (
          <a
            key={`${t.href}-${i}`}
            href={t.href}
            target="_blank"
            rel="noopener noreferrer"
            className={t.more ? "review-photo review-photo-more" : "review-photo"}
            aria-label={t.label}
          >
            {t.src ? (
              isOptimizable(t.src) ? (
                <Image src={t.src} alt="" fill sizes="120px" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.src} alt="" loading="lazy" />
              )
            ) : (
              <span>{t.label}</span>
            )}
          </a>
        ))}
      </div>

      {!atStart && (
        <button
          type="button"
          className="review-photos-btn review-photos-btn-prev"
          onClick={() => scrollByPhotos(-1)}
          aria-label="Show previous photos"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      {!atEnd && (
        <button
          type="button"
          className="review-photos-btn review-photos-btn-next"
          onClick={() => scrollByPhotos(1)}
          aria-label="Show more photos"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
