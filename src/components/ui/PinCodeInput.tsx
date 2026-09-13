"use client";

export function PinCodeInput({
  id,
  value,
  onChange,
  className,
  autoComplete,
  placeholder,
  required,
  pattern,
  title,
  ariaInvalid,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  pattern?: string;
  title?: string;
  ariaInvalid?: boolean;
}) {
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      maxLength={6}
      pattern={pattern}
      title={title}
      required={required}
      value={value}
      onChange={(e) =>
        onChange(e.target.value.replace(/\D/g, "").slice(0, 6))
      }
      className={className}
      autoComplete={autoComplete}
      placeholder={placeholder}
      aria-invalid={ariaInvalid}
    />
  );
}