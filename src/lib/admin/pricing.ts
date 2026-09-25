import { z } from "zod";

/** "12.5" | "" → paise; blank → null. Negative inputs parse (callers reject). */
export function toPaise(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = Math.round(parseFloat(v) * 100);
  return Number.isFinite(n) ? n : null;
}

const priceOnlySchema = z.object({
  id: z.string().min(1, "Mod id missing."),
  price: z.string().optional(),
  priceMin: z.string().optional(),
  priceMax: z.string().optional(),
  priceLabel: z.string().trim().optional(),
});

export type ModPriceInput = {
  id: string;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceLabel?: string;
};

export type ReadPriceResult = { data: ModPriceInput } | { error: string };

/** Parse the mod-price form; rejects negative prices before they hit the DB. */
export function readPriceOnly(formData: FormData): ReadPriceResult {
  const parsed = priceOnlySchema.safeParse({
    id: formData.get("id") || undefined,
    price: formData.get("price") || undefined,
    priceMin: formData.get("priceMin") || undefined,
    priceMax: formData.get("priceMax") || undefined,
    priceLabel: formData.get("priceLabel") || undefined,
  });
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Invalid mod." };
  const d = parsed.data;
  const price = toPaise(d.price);
  const priceMin = toPaise(d.priceMin);
  const priceMax = toPaise(d.priceMax);
  if ([price, priceMin, priceMax].some((n) => n !== null && n < 0)) {
    return { error: "Prices can't be negative." };
  }
  if (price == null && priceMin == null) {
    return { error: "Set a price or a price range." };
  }
  return { data: { ...d, price, priceMin, priceMax } };
}

/** Parse a CSV money cell to paise; null when it's blank, NaN, or negative. */
export function csvPaise(v: string | undefined): number | null {
  if (!v || v.trim() === "") return null;
  const n = Math.round(parseFloat(v.trim()) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Parse a CSV integer cell to a non-negative int; fallback when NaN/negative. */
export function csvInt(v: string | undefined, fallback: number): number {
  if (!v || v.trim() === "") return fallback;
  const n = parseInt(v.trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}