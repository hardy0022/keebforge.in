"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/lib/utils/cn";

type Props = {
  progressTargetRef: RefObject<HTMLElement | null>;
};

/** Rich body content per step. `options` renders the two shipping choices as a
    scannable label/description pair; `points` renders a compact tick list. Both
    are deliberately typographic — no card boxes — so the stage stays editorial. */
type Step = {
  num: string;
  title: string;
  lead: string;
  options?: { label: string; text: string }[];
  points?: string[];
  note?: string;
  sign?: string;
};

const STEPS: Step[] = [
  {
    num: "01",
    title: "Send it to us.",
    lead: "Once you've placed your order, you have two options:",
    options: [
      {
        label: "Ship it yourself",
        text: "Pack your keyboard, mouse, or device and send it to us using the courier of your choice. You provide the shipping and address details, and cover the shipping cost.",
      },
      {
        label: "Book a pickup",
        text: "We can arrange a pickup for you. Simply pack the device and hand it over to the pickup agent. The pickup and shipping charge is added to your order total.",
      },
    ],
  },
  {
    num: "02",
    title: "We diagnose and build.",
    lead: "Once we receive your device, we inspect it and determine what needs to be done. We work out:",
    points: [
      "What needs to be repaired, modified, or built",
      "The steps required",
      "Required parts and services",
      "Final pricing",
    ],
    note: "Once the work and pricing are confirmed, we proceed with the job.",
  },
  {
    num: "03",
    title: "We test everything.",
    lead: "Once the work is completed, we test the device before sending it back:",
    points: [
      "Switches and stabilizers",
      "Keys and inputs",
      "Firmware and functionality",
      "Repaired or replaced components",
      "Overall operation",
    ],
    note: "Where applicable, warranty coverage may be provided based on the work performed or parts installed.",
  },
  {
    num: "04",
    title: "We ship it back.",
    lead: "Once the work is complete and you're satisfied with the result, we prepare the device for its return journey:",
    points: [
      "Secure packing",
      "Return shipment",
      "Tracking where available",
      "Delivery back to your customer",
    ],
    sign: "From our workshop back to you.",
  },
];

/** Sticky workshop-process story: steps crossfade as the shared pinned stage scrolls. */
export function HowWeWork({ progressTargetRef }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const lastV = useRef(0);
  const isReduced = useRef(false);
  const [active, setActive] = useState(0);
  const [dir, setDir] = useState(1);

  /** Rail progress is the runway's own scroll fraction: 0 when the pinned
      runway top meets the viewport top, 1 when its bottom meets the viewport
      bottom. Written straight to a custom property — no easing, the fill
      tracks the scroll position exactly as the motion value did. Under
      reduced motion the rail stays full and the step index intentionally
      stops advancing, matching the previous hook's behaviour. */
  useEffect(() => {
    const rail = railRef.current;
    const target = progressTargetRef.current;
    if (!rail || !target) return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    isReduced.current = mq.matches;

    const update = () => {
      const rect = target.getBoundingClientRect();
      const span = rect.height - window.innerHeight;
      const v = isReduced.current
        ? 1
        : span <= 0
          ? 1
          : Math.min(1, Math.max(0, -rect.top / span));
      rail.style.setProperty("--hp-how-progress", String(v));
      if (isReduced.current || v === lastV.current) return;

      setDir(v >= lastV.current ? 1 : -1);
      lastV.current = v;
      const idx = Math.min(STEPS.length - 1, Math.floor(v * STEPS.length));
      setActive((cur) => (cur === idx ? cur : idx));
    };

    const onPrefChange = () => {
      isReduced.current = mq.matches;
      update();
    };

    mq.addEventListener("change", onPrefChange);
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update, { passive: true });
    update();

    return () => {
      mq.removeEventListener("change", onPrefChange);
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [progressTargetRef]);

  /** Forward: past steps sit above (-20), next steps below (+20). Backward: reversed. */
  const stepState = (i: number) => {
    if (i === active) return "is-active";
    const above = i < active;
    return dir >= 0 === above ? "is-past" : "is-next";
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
        <p className="hp-how-sub">
          From arrived-in-mail to back-on-desk — four steps, handled by hand.
        </p>
        <div className="hp-how-rail" ref={railRef} aria-hidden="true">
          <span className="hp-how-rail-fill" />
        </div>
        <p className="hp-how-count">
          <span className="num">{String(active + 1).padStart(2, "0")}</span> /{" "}
          {String(STEPS.length).padStart(2, "0")}
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
                <p className="hp-how-step-lead">{step.lead}</p>
                {step.options && (
                  <ul className="hp-how-step-options">
                    {step.options.map((o) => (
                      <li key={o.label}>
                        <span className="hp-how-opt-label">{o.label}</span>
                        <span className="hp-how-opt-text">{o.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {step.points && (
                  <ul className="hp-how-step-list">
                    {step.points.map((pt) => (
                      <li key={pt}>{pt}</li>
                    ))}
                  </ul>
                )}
                {step.note && <p className="hp-how-step-note">{step.note}</p>}
                {step.sign && <p className="hp-how-step-sign">{step.sign}</p>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
