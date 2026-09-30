import type { AnimatedIconProps } from "./types";

const CpuIcon = ({
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
      className={`icon-animated kf-ico-cpu cursor-pointer ${className}`}
    >
      <g className="pins">
        <path d="M12 20v2" />
        <path d="M12 2v2" />
        <path d="M17 20v2" />
        <path d="M17 2v2" />
        <path d="M2 12h2" />
        <path d="M2 17h2" />
        <path d="M2 7h2" />
        <path d="M20 12h2" />
        <path d="M20 17h2" />
        <path d="M20 7h2" />
        <path d="M7 20v2" />
        <path d="M7 2v2" />
      </g>
      <rect
        className="outer"
        style={{ transformOrigin: "12px 12px" }}
        x="4"
        y="4"
        width="16"
        height="16"
        rx="2"
      />
      <rect
        className="inner"
        style={{ transformOrigin: "12px 12px" }}
        x="8"
        y="8"
        width="8"
        height="8"
        rx="1"
      />
    </svg>
  );
};

CpuIcon.displayName = "CpuIcon";

export default CpuIcon;
