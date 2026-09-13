"use client";

import { useState } from "react";
import { EyeIcon } from "@/components/icons/eye-icon";

export function PasswordField({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  required,
  disabled,
  ariaDescribedBy,
  ariaInvalid,
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  disabled?: boolean;
  ariaDescribedBy?: string;
  ariaInvalid?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-wrapper">
      <input
        id={id}
        type={show ? "text" : "password"}
        required={required}
        autoComplete={autoComplete}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
      >
        <EyeIcon open={show} />
      </button>
    </div>
  );
}