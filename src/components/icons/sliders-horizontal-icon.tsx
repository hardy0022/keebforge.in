import type { AnimatedIconProps } from "./types";

const SlidersHorizontalIcon = ({
  size = 24,
  color = "currentColor",
  strokeWidth = 2,
  className = "",
}: AnimatedIconProps) => {
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
      className={`icon-animated kf-ico-sliders cursor-pointer ${className}`}
    >
      {/* Row 1: y=5 */}
      <line className="path-1-left" x1="3" y1="5" x2="10" y2="5" />
      <line className="slider-1" x1="14" y1="3" x2="14" y2="7" />
      <line className="path-1-right" x1="14" y1="5" x2="21" y2="5" />

      {/* Row 2: y=12 */}
      <line className="path-2-left" x1="3" y1="12" x2="8" y2="12" />
      <line className="slider-2" x1="8" y1="10" x2="8" y2="14" />
      <line className="path-2-right" x1="12" y1="12" x2="21" y2="12" />

      {/* Row 3: y=19 */}
      <line className="path-3-left" x1="3" y1="19" x2="12" y2="19" />
      <line className="slider-3" x1="16" y1="17" x2="16" y2="21" />
      <line className="path-3-right" x1="16" y1="19" x2="21" y2="19" />
    </svg>
  );
};

SlidersHorizontalIcon.displayName = "SlidersHorizontalIcon";

export default SlidersHorizontalIcon;
