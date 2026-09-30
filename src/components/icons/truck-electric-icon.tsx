import { forwardRef, useImperativeHandle, useCallback, useRef } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

const TruckElectricIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    const svgRef = useRef<SVGSVGElement>(null);

    // The parent (ShippingWarranty) owns the hover state and calls this handle;
    // the drive-off animation itself is CSS, keyed off .is-anim.
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
        className={`kf-ico-anim kf-ico-truck cursor-pointer ${className}`}
        style={{ overflow: "visible" }}
      >
        <g className="truck">
          <path d="M14 19V7a2 2 0 0 0-2-2H9" />
          <path d="M15 19H9" />
          <path d="M19 19h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62L18.3 9.38a1 1 0 0 0-.78-.38H14" />
          <path d="M2 13v5a1 1 0 0 0 1 1h2" />
          <path d="M4 3 2.15 5.15a.495.495 0 0 0 .35.86h2.15a.47.47 0 0 1 .35.86L3 9.02" />
          <circle cx="17" cy="19" r="2" />
          <circle cx="7" cy="19" r="2" />
        </g>
      </svg>
    );
  },
);

TruckElectricIcon.displayName = "TruckElectricIcon";

export default TruckElectricIcon;
