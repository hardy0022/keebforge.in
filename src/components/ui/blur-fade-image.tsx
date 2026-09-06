"use client";

import { BlurFade } from "@/components/ui/blur-fade";

type BlurFadeImageProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
};

/**
 * Subtle entrance animation for secondary public-facing imagery (product card
 * media, review photo strips, work sliders). Reveals once when scrolled into
 * view, using BlurFade's canonical defaults (0.4s, 6px blur, 6px drop).
 * Primary/LCP images should avoid this wrapper if it delays rendering, and
 * transactional/admin pages should stay plain. Reduced-motion users get a
 * static image via BlurFade's built-in bypass.
 */
export function BlurFadeImage({
  children,
  className,
  delay = 0,
}: BlurFadeImageProps) {
  return (
    <BlurFade inView className={className} delay={delay}>
      {children}
    </BlurFade>
  );
}
