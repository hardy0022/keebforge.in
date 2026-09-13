"use client";

/**
 * Radio pill group + pill option. Shared by /workshop (device type, shipping
 * method) and /mods (layout, keycaps, ship method, delivery speed). Value,
 * checked state and onChange come from the host; business rules stay there.
 */

export function PillRadioGroup({
  size,
  className,
  children,
}: {
  /** Wider min-column pills for long two-option labels (shipping, keycaps). */
  size?: "lg";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`pill-radio-group${size === "lg" ? " pill-radio-group-lg" : ""}${
        className ? ` ${className}` : ""
      }`}
    >
      {children}
    </div>
  );
}

export function PillRadio({
  name,
  value,
  label,
  checked,
  onChange,
}: {
  name: string;
  value: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className={`pill-radio${checked ? " selected" : ""}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
      />
      <span>{label}</span>
    </label>
  );
}