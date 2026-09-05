/**
 * Money helpers.
 *
 * Business rule (D-001): every monetary value is stored as INTEGER PAISE
 * (₹12 = 1200) at rest and in every computation. Floats are never used for
 * money — the drift corrupts totals. These formatters are the ONLY place a
 * paise amount may be turned into display text. To round paise, use
 * Math.round BEFORE formatting, never during.
 */

export function formatINR(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function formatINRRange(minPaise: number, maxPaise: number): string {
  return `₹${(minPaise / 100).toLocaleString("en-IN")}–${(maxPaise / 100).toLocaleString("en-IN")}`;
}