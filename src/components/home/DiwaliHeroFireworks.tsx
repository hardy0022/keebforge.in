"use client";

import { useEffect, useRef } from "react";

type Particle = {
  active: boolean;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  sat: number;
  light: number;
  alpha: number;
  gravity: number;
  drag: number;
  trail: boolean;
};

type Rocket = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
};

const PARTICLE_POOL = 220;
const ROCKET_POOL = 3;
const MAX_DPR = 2;

const BURST_ZONES = [
  [0.04, 0.28, 0.05, 0.3],
  [0.72, 0.96, 0.05, 0.3],
  [0.02, 0.17, 0.32, 0.7],
  [0.83, 0.98, 0.32, 0.7],
  [0.08, 0.3, 0.72, 0.92],
  [0.7, 0.92, 0.72, 0.92],
  [0.36, 0.64, 0.03, 0.16],
] as const;

function between(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function createParticle(): Particle {
  return {
    active: false,
    x: 0,
    y: 0,
    px: 0,
    py: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0,
    size: 1,
    hue: 42,
    sat: 95,
    light: 70,
    alpha: 1,
    gravity: 0,
    drag: 0.99,
    trail: false,
  };
}

function createRocket(): Rocket {
  return {
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0,
    hue: 42,
  };
}

/**
 * Decorative Diwali layer that sits behind the hero image. The reference image
 * has transparent margins around the switch, so warm bursts around the edges
 * remain visible while the product itself stays untouched.
 */
export function DiwaliHeroFireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const small = window.matchMedia("(max-width: 768px)");

    let reduced = motion.matches;
    let mobile = small.matches;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let visible = !document.hidden;
    let onScreen = true;
    let disposed = false;
    let last = 0;
    let nextEventAt = 0;
    let nextAmbientAt = 0;
    let raf = 0;
    let timer = 0;
    let particleCursor = 0;
    let particleCount = 0;
    let rocketCursor = 0;
    let rocketCount = 0;

    const particles = Array.from({ length: PARTICLE_POOL }, createParticle);
    const rockets = Array.from({ length: ROCKET_POOL }, createRocket);

    const capacity = () => (mobile ? 78 : 190);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
    };

    const activate = (
      x: number,
      y: number,
      vx: number,
      vy: number,
      maxLife: number,
      size: number,
      hue: number,
      sat: number,
      light: number,
      alpha: number,
      gravity: number,
      drag: number,
      trail: boolean,
    ) => {
      if (particleCount >= capacity()) return;

      let particle: Particle | null = null;
      for (let i = 0; i < PARTICLE_POOL; i += 1) {
        const candidate = particles[(particleCursor + i) % PARTICLE_POOL];
        if (!candidate.active) {
          particle = candidate;
          particleCursor = (particleCursor + i + 1) % PARTICLE_POOL;
          break;
        }
      }
      if (!particle) return;

      particle.active = true;
      particle.x = x;
      particle.y = y;
      particle.px = x;
      particle.py = y;
      particle.vx = vx;
      particle.vy = vy;
      particle.life = 0;
      particle.maxLife = maxLife;
      particle.size = size;
      particle.hue = hue;
      particle.sat = sat;
      particle.light = light;
      particle.alpha = alpha;
      particle.gravity = gravity;
      particle.drag = drag;
      particle.trail = trail;
      particleCount += 1;
    };

    const burst = (cx: number, cy: number, count: number, power: number) => {
      activate(
        cx,
        cy,
        0,
        0,
        between(240, 380),
        3.2,
        42,
        98,
        78,
        0.9,
        0,
        0.92,
        false,
      );

      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = power * between(0.25, 1);
        const accent = Math.random() < 0.16;
        activate(
          cx + between(-2, 2),
          cy + between(-2, 2),
          Math.cos(angle) * speed,
          Math.sin(angle) * speed,
          between(620, 1400),
          between(0.8, 2.1),
          accent ? between(315, 350) : between(34, 52),
          accent ? 78 : 96,
          accent ? between(68, 78) : between(64, 80),
          between(0.55, 0.95),
          between(18, 34),
          0.985,
          true,
        );
      }
    };

    const sparks = () => {
      const side = Math.random() < 0.5 ? -1 : 1;
      const baseX =
        width * (side < 0 ? between(0.03, 0.16) : between(0.84, 0.97));
      const baseY = height * between(0.66, 0.9);
      const count = mobile
        ? 6 + Math.floor(Math.random() * 6)
        : 11 + Math.floor(Math.random() * 10);

      for (let i = 0; i < count; i += 1) {
        const accent = Math.random() < 0.1;
        activate(
          baseX + between(-width * 0.02, width * 0.02),
          baseY + between(-height * 0.03, height * 0.03),
          side * between(4, 26) + between(-8, 8),
          -between(20, 58),
          between(800, 1800),
          between(0.55, 1.5),
          accent ? between(320, 350) : between(32, 50),
          accent ? 76 : 95,
          accent ? 72 : between(66, 74),
          between(0.45, 0.85),
          between(32, 58),
          0.99,
          true,
        );
      }
    };

    const ambient = (now: number) => {
      const count = mobile ? 1 : 2 + Math.floor(Math.random() * 2);

      for (let i = 0; i < count; i += 1) {
        const side = Math.random() < 0.5 ? -1 : 1;
        activate(
          width * (side < 0 ? between(0.02, 0.13) : between(0.87, 0.98)),
          height * between(0.72, 1.01),
          side * between(1, 6),
          -between(5, 18),
          between(2200, 4200),
          between(0.5, 1.1),
          Math.random() < 0.14 ? between(320, 345) : between(34, 50),
          88,
          between(62, 72),
          between(0.28, 0.52),
          -2,
          0.995,
          false,
        );
      }

      nextAmbientAt = now + between(mobile ? 1400 : 650, mobile ? 2400 : 1200);
    };

    const rocket = () => {
      if (mobile || rocketCount >= ROCKET_POOL) return;

      let item: Rocket | null = null;
      for (let i = 0; i < ROCKET_POOL; i += 1) {
        const candidate = rockets[(rocketCursor + i) % ROCKET_POOL];
        if (!candidate.active) {
          item = candidate;
          rocketCursor = (rocketCursor + i + 1) % ROCKET_POOL;
          break;
        }
      }
      if (!item) return;

      item.active = true;
      item.x =
        width * (Math.random() < 0.5 ? between(0.1, 0.3) : between(0.7, 0.9));
      item.y = height * between(0.78, 0.92);
      item.vx = between(-10, 10);
      item.vy = -between(90, 130);
      item.life = 0;
      item.maxLife = between(650, 1000);
      item.hue = between(38, 50);
      rocketCount += 1;
    };

    const triggerEvent = (now: number) => {
      const roll = Math.random();

      if (!mobile && roll < 0.08) {
        rocket();
      } else if (roll < 0.68) {
        const zone = BURST_ZONES[Math.floor(Math.random() * BURST_ZONES.length)];
        const count = mobile
          ? 13 + Math.floor(Math.random() * 8)
          : 22 + Math.floor(Math.random() * 14);
        const power = mobile ? 34 : 50;

        burst(
          width * between(zone[0], zone[1]),
          height * between(zone[2], zone[3]),
          count,
          power,
        );

        if (!mobile && Math.random() < 0.32) {
          const second =
            BURST_ZONES[Math.floor(Math.random() * BURST_ZONES.length)];
          burst(
            width * between(second[0], second[1]),
            height * between(second[2], second[3]),
            Math.floor(count * 0.7),
            power * 0.82,
          );
        }
      } else {
        sparks();
      }

      nextEventAt = now + between(mobile ? 2200 : 1100, mobile ? 4400 : 2600);
    };

    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(
        () => {
          if (disposed || !visible || reduced || !onScreen) return;
          last = 0;
          raf = requestAnimationFrame(frame);
        },
        Math.max(120, delay),
      );
    };

    const frame = (now: number) => {
      raf = 0;
      if (disposed || !visible || reduced || !onScreen) return;

      const minFrameMs = mobile ? 33 : 22;
      if (last && now - last < minFrameMs) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const dt = last ? Math.min(50, Math.max(0, now - last)) : 16;
      last = now;
      if (now >= nextAmbientAt) ambient(now);
      if (now >= nextEventAt) triggerEvent(now);

      const seconds = dt / 1000;
      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = "lighter";

      for (let i = 0; i < ROCKET_POOL; i += 1) {
        const item = rockets[i];
        if (!item.active) continue;

        item.life += dt;
        if (item.life >= item.maxLife) {
          item.active = false;
          rocketCount -= 1;
          burst(
            item.x,
            item.y,
            mobile ? 10 : 18 + Math.floor(Math.random() * 9),
            mobile ? 34 : 48,
          );
          continue;
        }

        item.vy += 14 * seconds;
        item.x += item.vx * seconds;
        item.y += item.vy * seconds;

        const alpha = 0.85 * (1 - item.life / item.maxLife);
        ctx.strokeStyle = `hsla(${item.hue}, 96%, 72%, ${alpha})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(item.x - item.vx * 0.14, item.y - item.vy * 0.14);
        ctx.lineTo(item.x, item.y);
        ctx.stroke();

        ctx.fillStyle = `hsla(${item.hue}, 98%, 80%, ${alpha})`;
        ctx.beginPath();
        ctx.arc(item.x, item.y, 1.7, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < PARTICLE_POOL; i += 1) {
        const particle = particles[i];
        if (!particle.active) continue;

        particle.life += dt;
        if (particle.life >= particle.maxLife) {
          particle.active = false;
          particleCount -= 1;
          continue;
        }

        particle.px = particle.x;
        particle.py = particle.y;
        particle.vx *= particle.drag;
        particle.vy = particle.vy * particle.drag + particle.gravity * seconds;
        particle.x += particle.vx * seconds;
        particle.y += particle.vy * seconds;

        const t = 1 - particle.life / particle.maxLife;
        const color = `hsla(${particle.hue}, ${particle.sat}%, ${particle.light}%, ${particle.alpha * t * t})`;

        if (particle.trail) {
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(0.5, particle.size * 0.7);
          ctx.beginPath();
          ctx.moveTo(particle.px, particle.py);
          ctx.lineTo(particle.x, particle.y);
          ctx.stroke();
        }

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(
          particle.x,
          particle.y,
          particle.size * (0.4 + t * 0.8),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }

      ctx.globalCompositeOperation = "source-over";

      if (particleCount > 0 || rocketCount > 0) {
        raf = requestAnimationFrame(frame);
      } else {
        schedule(
          Math.min(nextEventAt, nextAmbientAt) - performance.now(),
        );
      }
    };

    const pause = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      window.clearTimeout(timer);
      particleCount = 0;
      rocketCount = 0;
      for (const particle of particles) particle.active = false;
      for (const item of rockets) item.active = false;
      ctx.clearRect(0, 0, width, height);
    };

    const onVisibility = () => {
      visible = !document.hidden;
      if (!visible || reduced) {
        pause();
        return;
      }
      if (!onScreen) return;
      last = 0;
      nextEventAt = Math.max(nextEventAt, performance.now() + 500);
      schedule(500);
    };

    const onSmall = (event: MediaQueryListEvent) => {
      mobile = event.matches;
    };

    const onMotion = () => {
      reduced = motion.matches;
      if (reduced) {
        pause();
        return;
      }
      if (!visible || !onScreen) return;
      last = 0;
      nextEventAt = performance.now() + 500;
      schedule(500);
    };

    const onIntersect = (entries: IntersectionObserverEntry[]) => {
      const next = entries[0]?.isIntersecting ?? true;
      if (next === onScreen) return;
      onScreen = next;
      if (!onScreen) {
        pause();
        return;
      }
      if (!visible || reduced) return;
      last = 0;
      nextEventAt = performance.now() + 500;
      schedule(500);
    };

    const onResize = () => resize();

    resize();
    nextEventAt = performance.now() + between(220, 520);
    nextAmbientAt = performance.now() + between(120, 260);
    if (!reduced) schedule(nextAmbientAt - performance.now());

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(onResize)
        : null;
    const intersectObserver =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(onIntersect, { threshold: 0.01 })
        : null;
    resizeObserver?.observe(canvas);
    intersectObserver?.observe(canvas);
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    small.addEventListener?.("change", onSmall);
    motion.addEventListener?.("change", onMotion);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      resizeObserver?.disconnect();
      intersectObserver?.disconnect();
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      small.removeEventListener?.("change", onSmall);
      motion.removeEventListener?.("change", onMotion);
    };
  }, []);

  return (
    <div className="hp-diwali-fx" aria-hidden="true">
      <div className="hp-diwali-glow" />
      <canvas ref={canvasRef} className="hp-diwali-canvas" />
    </div>
  );
}
