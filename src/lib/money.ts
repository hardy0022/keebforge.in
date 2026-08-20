/** Money helpers — all prices are stored as integer paise. */

export function formatINR(paise: number): string {
  return "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

export function formatINRRange(minPaise: number, maxPaise: number): string {
  return `₹${(minPaise / 100).toLocaleString("en-IN")}–${(maxPaise / 100).toLocaleString("en-IN")}`;
}