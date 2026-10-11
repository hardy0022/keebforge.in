/**
 * Shared packed-package validation limits for mods orders. Client renders
 * hints against these; the server re-validates with the same numbers so the
 * UI and the Delhivery quoting endpoint can never drift apart.
 */
export const PACKAGE_LIMITS = {
  /** Max side length in cm — consumer keyboard/mouse parcels never need more. */
  MAX_DIM_CM: 100,
  /** Max combined L+W+H in cm, bounding the volumetric abuse a single side cap cannot. */
  MAX_COMBINED_CM: 250,
  /** Max packed weight in kg for consumer keyboard/mouse parcels. */
  MAX_WEIGHT_KG: 30,
} as const;

export function isValidPackage(p: {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKg: number;
}): boolean {
  const { MAX_DIM_CM, MAX_COMBINED_CM, MAX_WEIGHT_KG } = PACKAGE_LIMITS;
  const side = (v: number) =>
    Number.isFinite(v) && v > 0 && v <= MAX_DIM_CM;
  return (
    side(p.lengthCm) &&
    side(p.widthCm) &&
    side(p.heightCm) &&
    p.lengthCm + p.widthCm + p.heightCm <= MAX_COMBINED_CM &&
    Number.isFinite(p.weightKg) &&
    p.weightKg > 0 &&
    p.weightKg <= MAX_WEIGHT_KG
  );
}
