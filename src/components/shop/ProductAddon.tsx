"use client";

import { formatINR } from "@/lib/utils/money";

export type ProductAddonProps = {
  title: string;
  description?: string | null;
  price: number;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/**
 * The single optional product add-on (e.g. extended warranty). Rendered as one
 * selectable card with a real checkbox. The whole card toggles via the label,
 * so keyboard focus/space still operate the native input.
 */
export function ProductAddon({
  title,
  description,
  price,
  checked,
  onChange,
}: ProductAddonProps) {
  return (
    <label className={`product-addon${checked ? " selected" : ""}`}>
      <input
        type="checkbox"
        className="product-addon-check"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="product-addon-content">
        <span className="product-addon-head">
          <span className="product-addon-title">
            {title}
            <span className="product-addon-optional">Optional</span>
          </span>
          {price > 0 && (
            <span className="product-addon-price">+{formatINR(price)}</span>
          )}
        </span>
        {description ? (
          <span className="product-addon-desc">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
