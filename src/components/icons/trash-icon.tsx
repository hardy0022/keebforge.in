"use client";

import { forwardRef, useImperativeHandle, useCallback, useRef } from "react";
import type { AnimatedIconHandle } from "./types";
import type { AnimatedIconProps } from "./types";
import type { MouseEvent } from "react";

export interface TrashIconProps extends AnimatedIconProps {
  shakeOnClick?: boolean;
  dangerHover?: boolean;
  keepOpenOnDelete?: boolean;
}

const TrashIcon = forwardRef<AnimatedIconHandle, TrashIconProps>(
  (
    {
      shakeOnClick = false,
      dangerHover = false,
      keepOpenOnDelete = false,
      size = 24,
      color = "currentColor",
      strokeWidth = 2,
      className = "",
    },
    ref,
  ) => {
    const svgRef = useRef<SVGSVGElement>(null);

    const openLid = useCallback(() => {
      svgRef.current?.classList.add("is-open");
    }, []);

    const closeLid = useCallback(() => {
      svgRef.current?.classList.remove("is-open");
    }, []);

    const handleClick = (event: MouseEvent<SVGSVGElement>) => {
      if (shakeOnClick) {
        event.currentTarget.classList.add("is-tap");
        window.setTimeout(
          () => event.currentTarget.classList.remove("is-tap"),
          260,
        );
      }
      if (keepOpenOnDelete) {
        openLid();
      }
    };

    useImperativeHandle(ref, () => ({
      startAnimation: openLid,
      stopAnimation: closeLid,
    }));

    return (
      <svg
        ref={svgRef}
        className={`${className} trash-icon icon-animated kf-ico-trash${
          dangerHover ? " kf-ico-trash-danger" : ""
        }`}
        onClick={handleClick}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />

        <path
          d="M4 7l16 0"
          className="trash-lid-lower"
          style={{ transformOrigin: "50% 100%" }}
        />

        <path d="M10 11l0 6" />
        <path d="M14 11l0 6" />
        <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />

        <path
          d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"
          className="trash-lid-upper"
          style={{ transformOrigin: "50% 100%" }}
        />
      </svg>
    );
  },
);

TrashIcon.displayName = "TrashIcon";
export default TrashIcon;
