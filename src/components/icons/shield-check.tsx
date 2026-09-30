import { forwardRef, useImperativeHandle, useCallback, useRef } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

const ShieldCheck = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const svgRef = useRef<SVGSVGElement>(null);

    // The parent (ShippingWarranty) owns the hover state and calls this handle;
    // the animation itself is CSS, keyed off .is-anim.
    const start = useCallback(() => {
      svgRef.current?.classList.add("is-anim");
    }, []);

    const stop = useCallback(() => {
      svgRef.current?.classList.remove("is-anim");
    }, []);

    useImperativeHandle(ref, () => ({
      startAnimation: start,
      stopAnimation: stop,
    }));

    return (
      <svg
        ref={svgRef}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`kf-ico-anim kf-ico-shield cursor-pointer ${className}`}
        style={{ overflow: "visible" }}
      >
        <path
          className="shield-body"
          style={{ transformOrigin: "50% 50%" }}
          d="M11.46 20.846a12 12 0 0 1 -7.96 -14.846a12 12 0 0 0 8.5 -3a12 12 0 0 0 8.5 3a12 12 0 0 1 -.09 7.06"
        />

        <path
          className="shield-check"
          pathLength="1"
          d="M15 19l2 2l4 -4"
        />
      </svg>
    );
  },
);

ShieldCheck.displayName = "ShieldCheck";
export default ShieldCheck;
