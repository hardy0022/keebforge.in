"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Thin top bar shown while a client-side route navigation is in flight.
 *  Triggered by same-origin <a> clicks; completes when the target pathname
 *  commits (or a hard fallback timeout resets it). */
export function RouteProgress() {
  const pathname = usePathname();
  const [width, setWidth] = useState(0);
  const pendingPath = useRef<string | null>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const start = (target: string) => {
      pendingPath.current = target;
      setWidth(25);
    };

    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.("a") as
        | HTMLAnchorElement
        | null;
      if (!el) return;
      const href = el.getAttribute("href");
      if (
        el.target === "_blank" ||
        el.download ||
        e.defaultPrevented ||
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:") ||
        href.startsWith("http")
      ) {
        return;
      }
      start(new URL(href, window.location.href).pathname);
      // Hard reset: if the soft navigation stalls (e.g. an external redirect
      // or a cancelled prefetch), never leave the bar stuck on screen.
      window.setTimeout(() => {
        pendingPath.current = null;
        setWidth(0);
      }, 10000);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    if (!pendingPath.current) return;
    if (pathname === pendingPath.current) {
      pendingPath.current = null;
      setWidth(100);
      const t = window.setTimeout(() => setWidth(0), 260);
      return () => window.clearTimeout(t);
    }
  }, [pathname]);

  return (
    <div className="route-progress" aria-hidden="true">
      <div className="route-progress-bar" style={{ width: `${width}%` }} />
    </div>
  );
}