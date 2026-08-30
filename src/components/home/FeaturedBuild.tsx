"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { cldUrl } from "@/lib/cloudinary-url";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { HomeProduct } from "@/lib/home";

const WORDS = 30;
const SLIDE_MS = 5000;

/** First ~30 words, cut at a word boundary, with a trailing ellipsis. */
function truncateWords(text: string | null | undefined): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const words = clean.split(" ");
  if (words.length <= WORDS) return clean;
  return words.slice(0, WORDS).join(" ") + "...";
}

export function FeaturedBuild({ products }: { products: HomeProduct[] }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [0.94, 1, 1.02]);
  const frameY = useTransform(scrollYProgress, [0, 1], [30, 0]);

  useEffect(() => {
    if (products.length < 2 || reduced) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % products.length), SLIDE_MS);
    return () => clearInterval(id);
  }, [products.length, reduced]);

  if (products.length === 0) return null;

  const product = products[Math.min(index, products.length - 1)];
  const image = product.images[1] ?? product.images[0];
  const description = truncateWords(product.description);
  const transition = reduced ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <section ref={ref} className="hp-feature" aria-labelledby="featured-build">
      <div className="hp-feature-grid">
        <motion.div
          style={{ scale: reduced ? 1 : scale, y: reduced ? 0 : frameY }}
          className="hp-feature-media"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={product.id}
              className="hp-feature-media-slide"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={transition}
            >
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
          </AnimatePresence>
        </motion.div>

        <div className="hp-feature-body">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={product.id}
              className="hp-feature-body-slide"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={transition}
            >
              <p className="hp-kicker">
                <span className="hp-kicker-mark">{"//"}</span> Featured Build
              </p>
              <h2 id="featured-build" className="hp-feature-title">
                {product.name}
              </h2>
              <p className="hp-feature-desc">
                {description || "Bespoke keyboards built, tuned and finished around how you actually use them."}
              </p>
              <p className="hp-feature-price">
                Starting from <span className="num">{formatINR(product.price)}</span>
              </p>
              <Link href={`/product/${product.slug}`} className="btn-prime btn-prime-lg">
                View Build <span aria-hidden="true">→</span>
              </Link>
              <p className="hp-feature-cat num">{product.category?.name ?? "Keyboards"}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {products.length > 1 && (
        <div className="hp-feature-dots" role="group" aria-label="Featured products">
          {products.map((p, i) => (
            <button
              key={p.id}
              type="button"
              className={cn("hp-feature-dot", i === index && "is-active")}
              aria-label={`Show ${p.name}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </section>
  );
}