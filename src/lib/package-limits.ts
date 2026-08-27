/**
 * Shared packed-package validation limits for mods orders. Client renders
 * hints against these; the server re-validates with the same numbers so the
 * UI and the Delhivery quoting endpoint can never drift apart.
 */
export const PACKAGE_LIMITS = {
  /** Max side length in cm (~60 in courier norm). */
  MAX_DIM_CM: 152,
  /** Max packed weight in kg for consumer keyboard/mouse parcels. */
  MAX_WEIGHT_KG: 30,
} as const;

export function isValidPackage(p: { lengthCm: number; widthCm: number; heightCm: number; weightKg: number }): boolean {
  const { MAX_DIM_CM, MAX_WEIGHT_KG } = PACKAGE_LIMITS;
  return (
    Number.isFinite(p.lengthCm) && p.lengthCm > 0 && p.lengthCm <= MAX_DIM_CM &&
    Number.isFinite(p.widthCm) && p.widthCm > 0 && p.widthCm <= MAX_DIM_CM &&
    Number.isFinite(p.heightCm) && p.heightCm > 0 && p.heightCm <= MAX_DIM_CM &&
    Number.isFinite(p.weightKg) && p.weightKg > 0 && p.weightKg <= MAX_WEIGHT_KG
  );
}
