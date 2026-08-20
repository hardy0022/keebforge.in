import { formatINR, formatINRRange } from "@/lib/money";
import type { ServiceUnit } from "@prisma/client";

type Props = {
  price?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  unit?: ServiceUnit;
  priceLabel?: string | null;
  large?: boolean;
};

/** Renders a service price line: fixed, range, or Quote badge. */
export function PriceDisplay({ price, priceMin, priceMax, unit, priceLabel, large = false }: Props) {
  if (unit === "QUOTE" || (price === null && !priceMin)) {
    return <span className="qbadge">Quote Based</span>;
  }
  if (priceLabel) {
    return <em className={`ca${large ? " ca-lg" : ""}`}>{priceLabel}</em>;
  }
  if (priceMin && priceMax) {
    return <em className={`ca${large ? " ca-lg" : ""}`}>{formatINRRange(priceMin, priceMax)}</em>;
  }
  if (price) {
    return <em className={`ca${large ? " ca-lg" : ""}`}>{formatINR(price)}</em>;
  }
  return <span className="qbadge">Quote Based</span>;
}