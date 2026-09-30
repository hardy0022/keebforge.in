"use client";

import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

/**
 * Animated "user +" icon. The hover lift is CSS-only: `.icon-animated .user-avatar`
 * transitions `transform` over 0.25s and a parent `.nav-icon:hover` /
 * `.nav-profile-trigger:hover` applies `translateY(-1px) scale(1.05)`, while
 * `.icon-animated .plus-sign` rotates `45deg` and scales `1.15`; a
 * `prefers-reduced-motion: reduce` block disables both. `startAnimation`/
 * `stopAnimation` are kept as no-ops for source compatibility.
 */
const UserPlusIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    useImperativeHandle(ref, () => ({
      startAnimation: () => {},
      stopAnimation: () => {},
    }));

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`icon-animated cursor-pointer ${className}`}
      >
        <path stroke="none" d="M0 0h24v24H0z" fill="none" />

        {/* User avatar */}
        <g className="user-avatar">
          <path d="M8 7a4 4 0 1 0 8 0a4 4 0 0 0 -8 0" />
          <path d="M6 21v-2a4 4 0 0 1 4 -4h4" />
        </g>

        {/* Plus sign */}
        <g className="plus-sign">
          <path d="M16 19h6" />
          <path d="M19 16v6" />
        </g>
      </svg>
    );
  },
);

UserPlusIcon.displayName = "UserPlusIcon";
export default UserPlusIcon;