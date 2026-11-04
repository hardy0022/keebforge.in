"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils/cn";

type Spark = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  alpha: number;
};

const MAX_DPR = 2;

function between(min: number, max: number) {
  return min + Math.random() * (max - min);
}

/**
 * Small, idle-friendly canvas effect confined to the announcement bar. A
 * handful of warm sparks fire every few seconds, then the canvas stops
 * requesting frames until the next burst. Mobile halves the particle budget.
 */
export function DiwaliFireworks({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = window.matchMedia("(max-width: 640px)");
    if (motion.matches) return;

    let mobile = small.matches;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let sparks: Spark[] = [];
    let raf = 0;
    let timer = 0;
    let last = 0;
    let nextBurst = 0;
    let disposed = false;
    let visible = !document.hidden;

    const capacity = () => (mobile ? 42 : 84);

    const clear = () => {
      ctx.clearRect(0, 0, width, height);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      clear();
    };

    const spawn = (now: number) => {
      const count = mobile
        ? 8 + Math.floor(Math.random() * 5)
        : 14 + Math.floor(Math.random() * 8);
      const overflow = sparks.length + count - capacity();
      if (overflow > 0) sparks.splice(0, overflow);

      const x = width * between(0.08, 0.92);
      const y = height * between(0.5, 0.78);
      const hue = between(34, 52);
      const power = mobile ? 34 : 46;

      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = power * between(0.35, 1);
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - between(4, 16),
          life: 0,
          maxLife: between(520, 980),
          size: between(0.7, 1.7),
          hue: hue + between(-8, 8),
          alpha: between(0.45, 0.85),
        });
      }

      nextBurst = now + between(mobile ? 4200 : 2600, mobile ? 7600 : 4800);
    };

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          if (disposed || !visible) return;
          last = 0;
          raf = requestAnimationFrame(frame);
        },
        Math.max(120, delay),
      );
    };

    const frame = (now: number) => {
      raf = 0;
      if (disposed || !visible) return;

      const dt = last ? Math.min(32, Math.max(0, now - last)) : 16;
      last = now;
      if (now >= nextBurst) spawn(now);

      clear();
      ctx.globalCompositeOperation = "lighter";
      const seconds = dt / 1000;

      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const spark = sparks[i];
        spark.life += dt;
        if (spark.life >= spark.maxLife) {
          sparks.splice(i, 1);
          continue;
        }

        spark.vx *= 0.985;
        spark.vy = spark.vy * 0.985 + 26 * seconds;
        spark.x += spark.vx * seconds;
        spark.y += spark.vy * seconds;

        const t = 1 - spark.life / spark.maxLife;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${spark.hue}, 96%, ${62 + t * 18}%, ${spark.alpha * t * t})`;
        ctx.arc(spark.x, spark.y, spark.size * (0.5 + t * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";

      if (sparks.length > 0) {
        raf = requestAnimationFrame(frame);
      } else {
        schedule(nextBurst - now);
      }
    };

    const onResize = () => resize();
    const onVisibility = () => {
      visible = !document.hidden;
      if (!visible) {
        cancelAnimationFrame(raf);
        raf = 0;
        window.clearTimeout(timer);
        return;
      }
      nextBurst = Math.max(nextBurst, performance.now() + 600);
      schedule(600);
    };
    const onSmall = (event: MediaQueryListEvent) => {
      mobile = event.matches;
    };
    const onMotion = () => {
      if (motion.matches) {
        cancelAnimationFrame(raf);
        raf = 0;
        window.clearTimeout(timer);
        sparks = [];
        clear();
        return;
      }
      nextBurst = performance.now() + 800;
      schedule(800);
    };

    resize();
    nextBurst = performance.now() + (mobile ? 2600 : 1600);
    schedule(mobile ? 2600 : 1600);

    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    small.addEventListener?.("change", onSmall);
    motion.addEventListener?.("change", onMotion);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      small.removeEventListener?.("change", onSmall);
      motion.removeEventListener?.("change", onMotion);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={cn("kf-promo-fx", className)}
      aria-hidden="true"
    />
  );
}
