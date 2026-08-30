"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { cldUrl } from "@/lib/cloudinary-url";
import { formatINR } from "@/lib/money";
import type { HomeProduct } from "@/lib/home";

export function FeaturedBuild({ product }: { product: HomeProduct | null }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [reduced ? 1 : 0.94, 1, reduced ? 1 : 1.02]);
  const frameY = useTransform(scrollYProgress, [0, 1], [reduced ? 0 : 30, 0]);

  if (!product) return null;

  const image =
    product.images[1] ?? product.images[0];
  const fromPrice = product.price;

  return (
    <section ref={ref} className="hp-feature" aria-labelledby="featured-build">
      <div className="hp-feature-grid">
        <motion.div style={{ scale, y: frameY }} className="hp-feature-media">
          {image ? (
            <Image
              src={cldUrl(image.url, 1200)}
              alt={image.alt ?? product.name}
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="hp-feature-img"
            />
          ) : (
            <span className="hp-feature-fallback" aria-hidden="true">
              ⌨
            </span>
          )}
        </motion.div>

        <div className="hp-feature-body">
          <p className="hp-kicker">
            <span className="hp-kicker-mark">{"//"}</span> Featured Build
          </p>
          <h2 id="featured-build" className="hp-feature-title">
            {product.name}
          </h2>
          <p className="hp-feature-desc">
            {product.description ?? "Bespoke keyboards built, tuned and finished around how you actually use them."}
          </p>
          <p className="hp-feature-price">
            Starting from <span className="num">{formatINR(fromPrice)}</span>
          </p>
          <Link href={`/product/${product.slug}`} className="btn-prime btn-prime-lg">
            View Build <span aria-hidden="true">→</span>
          </Link>
          <p className="hp-feature-cat num">{product.category?.name ?? "Keyboards"}</p>
        </div>
      </div>
    </section>
  );
}