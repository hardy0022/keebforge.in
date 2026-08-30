"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";
import { cn } from "@/lib/utils";

type Props = {
  progressTargetRef: RefObject<HTMLElement | null>;
};

const STEPS = [
  { num: "01", title: "Send it to us.", desc: "Place an order and ship your board or mouse from anywhere in India." },
  { num: "02", title: "We diagnose and build.", desc: "We inspect, plan and do the work — lubing, tuning, soldering, firmware." },
  { num: "03", title: "We test everything.", desc: "Every switch, stabilizer and layer is verified before it ships." },
  { num: "04", title: "We ship it back.", desc: "Tracked, packed, and on its way back to your desk." },
];

/** Sticky workshop-process story: steps crossfade as the shared pinned stage scrolls. */
export function HowWeWork({ progressTargetRef }: Props) {
  const reduced = useReducedMotion();
  const lastV = useRef(0);
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState(1);

  const { scrollYProgress } = useScroll({
    target: progressTargetRef,
    offset: ["start start", "end end"],
  });
  const progress = useTransform(scrollYProgress, (v) => (reduced ? 1 : v));
  const railWidth = useTransform(progress, [0, 1], ["0%", "100%"]);

  useEffect(() => {
    return progress.on("change", (v) => {
      setDir(v >= lastV.current ? 1 : -1);
      lastV.current = v;
      const idx = Math.min(STEPS.length - 1, Math.floor(v * STEPS.length));
      setActive((cur) => (cur === idx ? cur : idx));
    });
  }, [progress]);

  /** Forward: past steps sit above (-20), next steps below (+20). Backward: reversed. */
  const stepState = (i: number) => {
    if (i === active) return "is-active";
    const above = i < active;
    return (dir >= 0) === above ? "is-past" : "is-next";
  };

  return (
    <section className="hp-how" aria-label="How we work">
      <div className="hp-how-side">
        <p className="hp-kicker">
          <span className="hp-kicker-mark">{"//"}</span> How We Work
        </p>
        <h2 className="hp-how-heading">
          The workshop
          <br />
          process.
        </h2>
        <p className="hp-how-sub">From arrived-in-mail to back-on-desk — four steps, handled by hand.</p>
        <div className="hp-how-rail" aria-hidden="true">
          <motion.span style={{ width: railWidth }} className="hp-how-rail-fill" />
        </div>
        <p className="hp-how-count">
          <span className="num">{String(active + 1).padStart(2, "0")}</span> / {String(STEPS.length).padStart(2, "0")}
        </p>
      </div>

      <div className="hp-how-steps">
        <div className="hp-how-viewport" role="list">
          {STEPS.map((step, i) => (
            <article
              key={step.num}
              className={cn("hp-how-step", stepState(i))}
              role="listitem"
            >
              <span className="hp-how-step-num" aria-hidden="true">
                {step.num}
              </span>
              <div className="hp-how-step-body">
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
                {i === 0 && <img src="/Blue Truck.svg" alt="" className="hp-how-step-img" />}
                {i === 1 && <img src="/robot process automation.svg" alt="" className="hp-how-step-img" />}
                {i === 2 && <img src="/Testing  Checking animation.svg" alt="" className="hp-how-step-img" />}
                {i === 3 && <img src="/Blue Truck.svg" alt="" className="hp-how-step-img hp-how-step-img-flip" />}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}