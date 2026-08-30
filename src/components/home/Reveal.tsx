"use client";

import { useEffect, useRef, useState, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  as?: ElementType;
  className?: string;
  delay?: number;
  children?: ReactNode;
  [key: string]: unknown;
};

/**
 * IntersectionObserver reveal. Adds `.in` once when the element enters the
 * viewport; CSS (`.hp-reveal`) owns the actual fade/translate/blur so reduced
 * motion and zero-JS collapse to a plain visible element.
 */
export function Reveal({ as = "div", className, delay = 0, children, ...rest }: RevealProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Tag = as as ElementType;

  return (
    <Tag
      ref={ref}
      className={cn("hp-reveal", inView && "in", className)}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  );
}