"use client";

import { INDIAN_STATES } from "@/lib/config/indian-states";

export function StateSelect({
  id,
  value,
  onChange,
  className,
  autoComplete,
  placeholder = "Select State",
  required,
  ariaInvalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  ariaInvalid?: boolean;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      autoComplete={autoComplete}
      required={required}
      aria-invalid={ariaInvalid}
    >
      <option value="">{placeholder}</option>
      {INDIAN_STATES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}