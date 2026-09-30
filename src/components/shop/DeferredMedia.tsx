"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Network gate for a shop card's media. The `<Image>` nodes stay unmounted
 * until the card approaches the viewport, so a dense listing does not release
 * every Cloudinary request at first layout. `loading="lazy"` cannot do this: it
 * is distance-based, so on a single-column mobile grid all cards cross the
 * threshold together and the requests burst.
 */
export function DeferredMedia({
  eager,
  children,
}: {
  eager: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(eager);

  useEffect(() => {
    const el = ref.current;
    if (eager || shown || !el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setShown(true);
        io.disconnect();
      },
      { rootMargin: "0px 0px 250px 0px", threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [eager, shown]);

  if (shown) return <>{children}</>;

  // Same class as the real media box: `.shop-card-media` is a 16/9
  // aspect-ratio container, so the placeholder holds the exact media area
  // (no skeleton animation, no layout shift) until the images exist.
  return <div ref={ref} className="shop-card-media" aria-hidden="true" />;
}
