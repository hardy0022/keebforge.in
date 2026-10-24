"use client";

import type { ProductColorOption } from "@prisma/client";

export type ColorOptionView = Pick<
  ProductColorOption,
  "id" | "name" | "colorCode" | "priceAdjustment" | "imageUrl" | "imagePublicId"
>;

export function ColorSelector({
  colors,
  selectedId,
  onChange,
  heading = "Color",
}: {
  colors: ColorOptionView[];
  selectedId: string | null;
  onChange: (id: string) => void;
  heading?: string;
}) {
  if (colors.length === 0) return null;

  return (
    <div className="product-color-section">
      <div className="product-color-head">
        <span className="product-option-label">{heading}</span>
      </div>
      <div
        className="product-color-swatches"
        role="radiogroup"
        aria-label="Color"
      >
        {colors.map((c) => {
          const selected = selectedId === c.id;
          const isLight =
            c.colorCode.toUpperCase() === "#FFFFFF" ||
            c.colorCode.toUpperCase() === "#FFF" ||
            c.colorCode.toLowerCase().startsWith("#f");
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`product-color-swatch${selected ? " selected" : ""}${
                isLight ? " light" : ""
              }`}
              style={{ backgroundColor: c.colorCode }}
              onClick={() => onChange(c.id)}
              title={c.name}
            >
              <span className="product-color-swatch-ring" aria-hidden="true" />
              {selected && (
                <span className="product-color-swatch-check" aria-hidden="true">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
