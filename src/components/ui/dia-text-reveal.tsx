"use client";

import {
  useEffect,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type RefObject,
} from "react";

import { cn } from "@/lib/utils/cn";

const DEFAULT_COLORS = ["#c679c4", "#fa3d1d", "#ffb005", "#e1e1fe", "#0358f7"];
const BAND_HALF = 17;
const SWEEP_START = -BAND_HALF;
const SWEEP_END = 100 + BAND_HALF;
const WIDTH_MS = 400;

const sweepEase = (t: number) =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

function buildGradient(pos: number, colors: string[], textColor: string) {
  const bandStart = pos - BAND_HALF;
  const bandEnd = pos + BAND_HALF;

  if (bandStart >= 100) {
    return `linear-gradient(90deg, ${textColor}, ${textColor})`;
  }
  const n = colors.length;
  const parts: string[] = [];

  if (bandStart > 0)
    parts.push(`${textColor} 0%`, `${textColor} ${bandStart.toFixed(2)}%`);

  colors.forEach((c, i) => {
    const pct = n === 1 ? pos : bandStart + (i / (n - 1)) * BAND_HALF * 2;
    parts.push(`${c} ${pct.toFixed(2)}%`);
  });

  if (bandEnd < 100)
    parts.push(`transparent ${bandEnd.toFixed(2)}%`, `transparent 100%`);

  return `linear-gradient(90deg, ${parts.join(", ")})`;
}

function measureWidths(el: HTMLElement, texts: string[]) {
  const ghost = el.cloneNode() as HTMLElement;
  Object.assign(ghost.style, {
    position: "absolute",
    visibility: "hidden",
    pointerEvents: "none",
    width: "auto",
    whiteSpace: "nowrap",
  });
  el.parentElement!.appendChild(ghost);
  const widths = texts.map((t) => {
    ghost.textContent = t;
    return ghost.getBoundingClientRect().width;
  });
  ghost.remove();
  return widths;
}

function sweepPos(now: number, start: number, durMs: number, delayMs: number) {
  const elapsed = Math.round(now - start) - delayMs;
  if (elapsed < 0) return SWEEP_START;
  if (elapsed >= durMs) return SWEEP_END;
  return SWEEP_START + (SWEEP_END - SWEEP_START) * sweepEase(elapsed / durMs);
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - bx - cx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - by - cy;
  return (x: number) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (d === 0) break;
      t -= (((ax * t + bx) * t + cx) * t - x) / d;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}

const widthEase = cubicBezier(0.4, 0, 0.2, 1);

function useInView(ref: RefObject<HTMLSpanElement | null>, once: boolean, amount: number) {
  const [isInView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let leave: (() => void) | undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting === Boolean(leave)) return;
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.unobserve(el);
          else
            leave = () => {
              leave = undefined;
              setInView(false);
            };
        } else if (leave) {
          leave();
        }
      },
      { threshold: amount },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, once, amount]);

  return isInView;
}

function usePrefersReducedMotion() {
  const [reduced] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion)").matches,
  );
  return reduced;
}

/**
 * Props for {@link DiaTextReveal}.
 */
export interface DiaTextRevealProps
  extends Omit<ComponentPropsWithoutRef<"span">, "children" | "style" | "color"> {
  /**
   * Text to reveal. Pass multiple strings to rotate when {@link DiaTextRevealProps.repeat} is `true`.
   */
  text: string | string[];
  /**
   * Colors sampled across the moving gradient band. Defaults to a built-in palette.
   */
  colors?: string[];
  /**
   * CSS color for revealed text after the sweep and for leading/trailing regions during the animation.
   * @defaultValue `"var(--foreground)"`
   */
  textColor?: string;
  /**
   * Duration of one sweep pass, in seconds.
   * @defaultValue `1.5`
   */
  duration?: number;
  /**
   * Delay before the sweep starts, in seconds.
   * @defaultValue `0`
   */
  delay?: number;
  /**
   * When `text` is an array, replay the sweep and advance to the next string after each completion.
   * @defaultValue `false`
   */
  repeat?: boolean;
  /**
   * Pause between cycles when {@link DiaTextRevealProps.repeat} is `true`, in seconds.
   * @defaultValue `0.5`
   */
  repeatDelay?: number;
  /**
   * If `true`, the animation starts only after the element enters the viewport.
   * @defaultValue `true`
   */
  startOnView?: boolean;
  /**
   * Passed to `useInView`: if `true`, in-view detection fires at most once (no replay on scroll-back).
   * @defaultValue `true`
   */
  once?: boolean;
  /**
   * Additional class names for the animated `span` (e.g. typography utilities).
   */
  className?: string;
  /**
   * When `text` has multiple entries, use the widest string’s width for layout instead of animating width per line.
   * @defaultValue `false`
   */
  fixedWidth?: boolean;
}

export function DiaTextReveal({
  text,
  colors = DEFAULT_COLORS,
  textColor = "var(--foreground)",
  duration = 1.5,
  delay = 0,
  repeat = false,
  repeatDelay = 0.5,
  startOnView = true,
  once = true,
  className,
  fixedWidth = false,
  ...props
}: DiaTextRevealProps) {
  const texts = Array.isArray(text) ? text : [text];
  const isMulti = texts.length > 1;
  const prefersReducedMotion = usePrefersReducedMotion();

  const spanRef = useRef<HTMLSpanElement>(null);
  const optsRef = useRef({
    colors,
    textColor,
    duration,
    delay,
    repeat,
    repeatDelay,
    texts,
  });

  useEffect(() => {
    optsRef.current = {
      colors,
      textColor,
      duration,
      delay,
      repeat,
      repeatDelay,
      texts,
    };
  });

  const indexRef = useRef(0);
  const hasPlayedRef = useRef(false);

  const [activeIndex, setActiveIndex] = useState(0);
  const [measuredWidths, setMeasuredWidths] = useState<number[]>([]);
  const [initialGradient] = useState(() => buildGradient(SWEEP_START, colors, textColor));

  const isInView = useInView(spanRef, once, 0.1);
  const textKey = Array.isArray(text) ? text.join("\0") : text;

  useEffect(() => {
    const el = spanRef.current;
    if (!el || !isMulti) return;
    setMeasuredWidths(measureWidths(el, optsRef.current.texts));
  }, [textKey, isMulti]);

  useEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    if (prefersReducedMotion) {
      el.style.backgroundImage = buildGradient(
        SWEEP_END,
        optsRef.current.colors,
        optsRef.current.textColor,
      );
      return;
    }
    if (startOnView && !isInView) return;
    if (once && hasPlayedRef.current) return;
    hasPlayedRef.current = true;

    const { duration, delay, repeat, repeatDelay, texts } = optsRef.current;
    const durMs = duration * 1000;
    const delayMs = delay * 1000;
    let raf = 0;
    let start = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const write = (pos: number) => {
      el.style.backgroundImage = buildGradient(
        pos,
        optsRef.current.colors,
        optsRef.current.textColor,
      );
    };

    const frame = () => {
      const pos = sweepPos(performance.now(), start, durMs, delayMs);
      write(pos);
      if (pos < SWEEP_END) {
        raf = requestAnimationFrame(frame);
        return;
      }
      raf = 0;
      if (!repeat) return;
      timer = setTimeout(() => {
        indexRef.current = (indexRef.current + 1) % texts.length;
        setActiveIndex(indexRef.current);
        play();
      }, repeatDelay * 1000);
    };

    function play() {
      write(SWEEP_START);
      start = performance.now();
      raf = requestAnimationFrame(frame);
    }

    play();

    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        write(sweepPos(performance.now(), start, durMs, delayMs));
        return;
      }
      clearTimeout(timer);
    };
  }, [isInView, startOnView, once, prefersReducedMotion]);

  const fixedW =
    isMulti && fixedWidth && measuredWidths.length > 0
      ? Math.max(...measuredWidths)
      : undefined;

  const animatedW =
    isMulti && !fixedWidth && measuredWidths[activeIndex] != null
      ? measuredWidths[activeIndex]
      : undefined;

  useEffect(() => {
    const el = spanRef.current;
    if (!el || animatedW == null) return;
    const from = parseFloat(el.style.width);
    if (!Number.isFinite(from)) {
      el.style.width = `${animatedW}px`;
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = () => {
      const t = Math.min(1, Math.round(performance.now() - start) / WIDTH_MS);
      el.style.width = `${from + (animatedW - from) * widthEase(t)}px`;
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animatedW]);

  return (
    <span
      ref={spanRef}
      className={cn("align-bottom leading-[100%] text-inherit", className)}
      style={{
        transform: "translateY(-2px)",
        color: "transparent",
        backgroundClip: "text",
        WebkitBackgroundClip: "text",
        backgroundSize: "100% 100%",
        backgroundImage: initialGradient,
        ...(isMulti && {
          display: "inline-block",
          overflow: "hidden",
          whiteSpace: "nowrap",
          verticalAlign: "text-center",
          ...(fixedW != null && { width: fixedW }),
        }),
      }}
      {...props}
    >
      {texts[activeIndex]}
    </span>
  );
}
