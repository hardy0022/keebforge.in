"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { formatINR } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";
import ArrowBigLeftIcon from "@/components/icons/arrow-big-left-icon";
import ArrowBigRightIcon from "@/components/icons/arrow-big-right-icon";
import type { HomeProduct } from "@/lib/home";

const WORDS = 30;
const SLIDE_MS = 5000;
const SLIDE_FADE_MS = 400;

// ponytail: `<AnimatePresence mode="wait" initial={false}>` ported to a
// three-state slide (shown / exiting / entering). The measured contract it has
// to keep: the first paint is already at the animate values (initial={false}),
// a key change plays the exit to completion before the next slide mounts, the
// exit is not restarted by a further change (the newest index wins and the
// slides in between are skipped), and returning to the exiting slide cancels
// the exit so it animates back without ever unmounting.
const SLIDE_EXIT = "opacity-0 [transform:translateX(-12px)]";
const SLIDE_ENTER = "opacity-0 [transform:translateX(12px)]";

/** First ~30 words, cut at a word boundary, with a trailing ellipsis. */
function truncateWords(text: string | null | undefined): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const words = clean.split(" ");
  if (words.length <= WORDS) return clean;
  return words.slice(0, WORDS).join(" ") + "...";
}

// ponytail: motion's useReducedMotion() samples matchMedia once inside
// useState and never subscribes, so the value is latched for the lifetime of
// the component; on the server it returns `null`, which is falsy like `false`
// and is only ever read for truthiness here.
function useReducedMotion() {
  const [reduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion)").matches,
  );
  return reduced;
}

const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

export function FeaturedBuild({ products }: { products: HomeProduct[] }) {
  const ref = useRef<HTMLElement>(null);
  const media = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [view, setView] = useState({
    shown: 0,
    exiting: false,
    entering: false,
  });

  const latest = useRef(index);
  const shown = useRef(0);
  const exiting = useRef(false);
  const swap = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current = index;
  }, [index]);

  useEffect(() => {
    if (products.length < 2 || reduced) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % products.length),
      SLIDE_MS,
    );
    return () => clearInterval(id);
  }, [products.length, reduced, index]);

  useEffect(() => {
    const idOf = (i: number) =>
      products[Math.min(i, products.length - 1)]?.id;

    if (idOf(index) === idOf(shown.current)) {
      // reversed mid-exit: the slide stays mounted and animates back
      if (exiting.current) {
        if (swap.current !== null) {
          clearTimeout(swap.current);
        }
        swap.current = null;
        exiting.current = false;
        setView((v) => ({ ...v, exiting: false }));
      }
      return;
    }
    // already on the way out: leave the exit running so the swap below lands
    // on whichever index is newest when it finishes
    if (exiting.current) return;

    exiting.current = true;
    setView((v) => ({ ...v, exiting: true }));
    // the exit transition only starts on the next frame, so its clock starts
    // there too - a timer armed by the click itself cuts the last frame off
    requestAnimationFrame(() => {
      if (!exiting.current) return;
      swap.current = setTimeout(
        () => {
          swap.current = null;
          exiting.current = false;
          const next = latest.current;
          shown.current = next;
          // the incoming slide has to be committed at its enter origin before
          // the class comes off, otherwise the transition has no start value
          flushSync(() =>
            setView({ shown: next, exiting: false, entering: true }),
          );
          void media.current?.offsetHeight;
          setView((v) => (v.entering ? { ...v, entering: false } : v));
        },
        reduced ? 0 : SLIDE_FADE_MS,
      );
    });
  }, [index, products, reduced]);

  useEffect(
    () => () => {
      if (swap.current !== null) {
        clearTimeout(swap.current);
      }
    },
    [],
  );

  // ponytail: motion resolves offset ["start end", "end start"] to
  // progress = (scrollY + viewportH - sectionTop) / (sectionH + viewportH),
  // clamped, then runs it through two linear transforms. It mixes
  // clientHeight (border box excluded) with an offsetTop-chain inset; a single
  // getBoundingClientRect keeps both consistent - measured drift <=0.007px.
  useIsomorphicLayoutEffect(() => {
    const node = media.current;
    const section = ref.current;
    if (!node || !section || reduced) return;

    const update = () => {
      const rect = section.getBoundingClientRect();
      const height = document.documentElement.clientHeight;
      const p = Math.min(
        1,
        Math.max(0, (height - rect.top) / (rect.height + height)),
      );
      const scale = p < 0.5 ? 0.94 + 0.12 * p : 1 + 0.04 * (p - 0.5);
      node.style.transform = `translateY(${30 * (1 - p)}px) scale(${scale})`;
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [reduced]);

  if (products.length === 0) return null;

  const product = products[Math.min(view.shown, products.length - 1)];
  const image = product.images[1] ?? product.images[0];
  const description = truncateWords(product.description);
  const slide = (name: string) =>
    cn(
      name,
      "transition-[opacity,transform]",
      reduced ? "duration-0" : "duration-[400ms]",
      "ease-[cubic-bezier(0.16,1,0.3,1)]",
      view.exiting ? SLIDE_EXIT : view.entering ? SLIDE_ENTER : null,
    );

  return (
    <section ref={ref} className="hp-feature" aria-labelledby="featured-build">
      <header className="hp-section-head">
        <p className="hp-kicker">
          <span className="hp-kicker-mark">{"//"}</span> Featured Build
        </p>
      </header>
      <div className="hp-feature-grid">
        <div ref={media} className="hp-feature-media">
          <div key={product.id} className={slide("hp-feature-media-slide")}>
            {image ? (
              <Image
                src={image.url}
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
          </div>
        </div>

        <div className="hp-feature-body">
          <div key={product.id} className={slide("hp-feature-body-slide")}>
            <h2 id="featured-build" className="hp-feature-title">
              {product.name}
            </h2>
            <p className="hp-feature-desc">
              {description ||
                "Bespoke keyboards built, tuned and finished around how you actually use them."}
            </p>
            <p className="hp-feature-price">
              Starting from{" "}
              <span className="num">{formatINR(product.price)}</span>
            </p>
            <Link
              href={`/product/${product.slug}`}
              className="btn-prime btn-prime-lg"
            >
              View Build <span aria-hidden="true">→</span>
            </Link>
            <p className="hp-feature-cat num">
              {product.category?.name ?? "Keyboards"}
            </p>
          </div>
        </div>
      </div>

      {products.length > 1 && (
        <div
          className="hp-feature-dots"
          role="group"
          aria-label="Featured products"
        >
          <button
            type="button"
            className="hp-feature-arrow hp-feature-arrow-prev"
            aria-label="Previous featured build"
            onClick={() => setIndex((i) => (i - 1 + products.length) % products.length)}
          >
            <ArrowBigLeftIcon size={18} />
          </button>
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
          <button
            type="button"
            className="hp-feature-arrow hp-feature-arrow-next"
            aria-label="Next featured build"
            onClick={() => setIndex((i) => (i + 1) % products.length)}
          >
            <ArrowBigRightIcon size={18} />
          </button>
        </div>
      )}
    </section>
  );
}
