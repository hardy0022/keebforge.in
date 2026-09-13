"use client";

import { forwardRef, useImperativeHandle } from "react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

/**
 * Animated cart icon. The hover play/stop are driven entirely by CSS now
 * (.icon-animated + .nav-icon:hover) — the motion/react runtime was being
 * pulled into the app shell on every page just for a hover wriggle.
 * `startAnimation`/`stopAnimation` are kept as no-ops so SiteHeader's ref
 * calls stay source-compatible.
 */
const CartIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  (
    { size = 24, color = "currentColor", strokeWidth = 2, className = "" },
    ref,
  ) => {
    useImperativeHandle(ref, () => ({
      startAnimation: () => {},
      stopAnimation: () => {},
    }));

    return (
      <div className={`icon-animated inline-flex cursor-pointer ${className}`}>
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
          className="cart-icon"
        >
          <path stroke="none" d="M0 0h24v24H0z" fill="none" />

          <circle cx="6" cy="19" r="2" className="cart-wheel-left" />

          <circle cx="17" cy="19" r="2" className="cart-wheel-right" />

          <path d="M17 17h-11v-14h-2" />

          <path d="M6 5l14 1l-1 7h-13" />
        </svg>
      </div>
    );
  },
);

CartIcon.displayName = "CartIcon";

export default CartIcon;