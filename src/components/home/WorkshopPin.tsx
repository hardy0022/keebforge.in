"use client";

import { useRef } from "react";
import { ScrollStatement } from "./ScrollStatement";
import { HowWeWork } from "./HowWeWork";

/** Shared sticky runway: the statement pins at the top while the workshop steps
    crossfade below it, then both scroll away together. Scroll progress is read
    from the non-sticky runway wrapper (sticky targets freeze motion's useScroll). */
export function WorkshopPin() {
  const pinRef = useRef<HTMLDivElement>(null);
  return (
    <div className="hp-pin" ref={pinRef}>
      <div className="hp-pin-stage">
        <ScrollStatement />
        <HowWeWork progressTargetRef={pinRef} />
      </div>
    </div>
  );
}