"use client";

/**
 * Labeled form field scaffold: uppercase micro-label + control + optional
 * inline note. Shared by /workshop and /mods; the `kf-field` base class is the
 * ONE canonical field visual system both flows render. `className` carries
 * only layout hooks (grid span, spacing) — never page-specific field styling.
 * The host provides the control as `children`; the `.kf-field *` rules in
 * globals.css style it identically regardless of flow.
 */

export function Field({
  label,
  htmlFor,
  note,
  className,
  style,
  children,
}: {
  label: string;
  htmlFor?: string;
  /** Rendered after the control (inline validation note, hint). */
  note?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div className={`kf-field${className ? ` ${className}` : ""}`} style={style}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {note}
    </div>
  );
}