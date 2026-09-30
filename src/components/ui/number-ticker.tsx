"use client";

import { useEffect, useRef, useState, type ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils/cn";

interface NumberTickerProps extends ComponentPropsWithoutRef<"span"> {
  value: number;
  startValue?: number;
  direction?: "up" | "down";
  delay?: number;
  decimalPlaces?: number;
}

// ponytail: analytic port of motion's `useSpring({ damping: 60, stiffness: 100 })`.
// Damping ratio 3 > 1, so only motion's overdamped branch is reachable; the
// constants and solution mirror motion-dom/animation/generators/spring.ts, while
// follow-value.ts pins restDelta/restSpeed to 0.001/0.01, negates the retarget
// velocity into units/ms, and resolves duration by stepping the generator in 50ms
// increments. Verified bit-identical against motion 13.1.1's own generator.
const STIFFNESS = 100;
const DAMPING = 60;
const MASS = 1;
const REST_DELTA = 0.001;
const REST_SPEED = 0.01;
const MAX_DURATION = 20000;

const DAMPING_RATIO = DAMPING / (2 * Math.sqrt(STIFFNESS * MASS));
const UNDAMPED = Math.sqrt(STIFFNESS / MASS) / 1000;
const DAMPED = UNDAMPED * Math.sqrt(DAMPING_RATIO * DAMPING_RATIO - 1);

interface Spring {
  target: number;
  delta: number;
  offset: number;
  sinh: number;
  cosh: number;
  duration: number;
  value: number;
  velocity: number;
}

interface Animation {
  node: HTMLSpanElement | null;
  spring: Spring | null;
  origin: number;
  lastValue: number;
  startedAt: number;
  frame: number;
  running: boolean;
  pending: number | null;
  decimalPlaces: number;
}

function createAnimation(origin: number, decimalPlaces: number): Animation {
  return {
    node: null,
    spring: null,
    origin,
    lastValue: origin,
    startedAt: 0,
    frame: 0,
    running: false,
    pending: null,
    decimalPlaces,
  };
}

function readSpring(spring: Spring, t: number) {
  const envelope = Math.exp(-DAMPING_RATIO * UNDAMPED * t);
  const freq = Math.min(DAMPED * t, 300);
  spring.value =
    spring.target -
    (envelope *
      (spring.offset * Math.sinh(freq) +
        DAMPED * spring.delta * Math.cosh(freq))) /
      DAMPED;
  spring.velocity =
    envelope *
    (spring.sinh * Math.sinh(freq) + spring.cosh * Math.cosh(freq)) *
    1000;
}

function startSpring(origin: number, target: number, velocity: number): Spring {
  const delta = target - origin;
  const initialVelocity = -velocity / 1000;
  const offset = initialVelocity + DAMPING_RATIO * UNDAMPED * delta;
  const p = offset / DAMPED;
  const spring: Spring = {
    target,
    delta,
    offset,
    sinh: DAMPING_RATIO * UNDAMPED * p - delta * DAMPED,
    cosh: DAMPING_RATIO * UNDAMPED * delta - p * DAMPED,
    duration: Infinity,
    value: origin,
    velocity,
  };

  // calc-duration.ts steps the generator every 50ms and yields Infinity if it
  // has not come to rest by the 20s cap, so a stuck spring never "finishes"
  let duration = Infinity;
  for (let t = 0; t < MAX_DURATION; t += 50) {
    readSpring(spring, t);
    if (
      Math.abs(spring.velocity) <= REST_SPEED &&
      Math.abs(spring.target - spring.value) <= REST_DELTA
    ) {
      duration = t;
      break;
    }
  }
  spring.duration = duration;

  spring.value = origin;
  spring.velocity = velocity;
  return spring;
}

function render(animation: Animation, latest: number) {
  if (latest === animation.lastValue) {
    return;
  }
  animation.lastValue = latest;
  if (animation.node) {
    const { decimalPlaces } = animation;
    animation.node.textContent = Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    }).format(Number(latest.toFixed(decimalPlaces)));
  }
}

function advance(animation: Animation, timestamp: number) {
  const spring = animation.spring;
  if (!spring) {
    return;
  }
  const elapsed = Math.max(Math.round(timestamp - animation.startedAt), 0);
  readSpring(spring, elapsed);
  if (elapsed >= spring.duration) {
    animation.running = false;
    render(animation, spring.target);
    return;
  }
  render(animation, spring.value);
}

function scheduleFrame(animation: Animation) {
  animation.frame = requestAnimationFrame(() => {
    // motion's frameloop stamps each frame with a single performance.now() read
    // at the top of its batch (batcher.mjs), not the rAF timestamp argument, and
    // reuses that reading for both the tick and a spring started in the same
    // frame; the rAF timestamp is the earlier vsync time and skews the spring
    tick(animation, performance.now());
  });
}

function tick(animation: Animation, timestamp: number) {
  animation.frame = 0;

  // motion's frameloop ticks the in-flight spring during this frame's update
  // step, so the outgoing animation always gets one last sample
  if (animation.running) {
    advance(animation, timestamp);
  }

  // follow-value.ts builds the replacement spring from frame.postRender, i.e.
  // after the tick above: the new spring re-seeds from the freshest value and
  // analytical velocity instead of from whenever the setter happened to run
  if (animation.pending !== null) {
    const target = animation.pending;
    animation.pending = null;
    const previous = animation.spring;
    const origin = previous ? previous.value : animation.origin;
    if (origin === target) {
      // follow-value.ts skips the animation when it is already at the target
      animation.running = false;
      return;
    }
    animation.spring = startSpring(
      origin,
      target,
      previous ? previous.velocity : 0,
    );
    animation.startedAt = timestamp;
    animation.running = true;
  } else if (!animation.running) {
    return;
  }

  scheduleFrame(animation);
}

function setTarget(animation: Animation, target: number) {
  // a stable callback lets repeated sets in one frame collapse into the last
  // target, matching follow-value.ts's postRender dedupe
  animation.pending = target;
  if (!animation.frame) {
    scheduleFrame(animation);
  }
}

export function NumberTicker({
  value,
  startValue = 0,
  direction = "up",
  delay = 0,
  className,
  decimalPlaces = 0,
  ...props
}: NumberTickerProps) {
  const ref = useRef<HTMLSpanElement>(null);
  // useMotionValue() evaluates but only keeps its argument on the first render
  const state = useRef<Animation>(
    createAnimation(direction === "down" ? value : startValue, decimalPlaces),
  );
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    state.current.decimalPlaces = decimalPlaces;
  }, [decimalPlaces]);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    state.current.node = node;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }
        setIsInView(true);
        observer.disconnect();
      },
      { rootMargin: "0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    if (isInView) {
      timer = setTimeout(() => {
        setTarget(state.current, direction === "down" ? startValue : value);
      }, delay * 1000);
    }

    return () => {
      if (timer !== null) {
        clearTimeout(timer);
      }
    };
  }, [isInView, delay, value, direction, startValue]);

  useEffect(
    () => () => {
      if (state.current.frame) {
        cancelAnimationFrame(state.current.frame);
      }
    },
    [],
  );

  return (
    <span
      ref={ref}
      className={cn(
        "inline-block tracking-wider text-black tabular-nums dark:text-white",
        className,
      )}
      {...props}
    >
      {startValue}
    </span>
  );
}
