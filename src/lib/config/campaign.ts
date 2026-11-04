/**
 * Temporary seasonal campaign configuration.
 *
 * This is deliberately the only place the Diwali promotion is defined. To end
 * the promotion early set `enabled` to false (or remove this file plus the
 * `DiwaliAnnouncement` usage in the shared layout). After `endsAt` the
 * announcement hides itself automatically.
 *
 * The storefront never computes discounts. Checkout validates and applies the
 * `DIWALI15` coupon server-side through the existing coupon pipeline.
 *
 * `heroAnimationEnabled` controls the separate Diwali canvas layer inside the
 * homepage hero. Turn it off to keep the announcement without the animation.
 */
export const DIWALI_CAMPAIGN = {
  id: "diwali-2026",
  enabled: true,
  title: "Diwali Offer",
  discountPercent: 15,
  endsOnLabel: "15 November",
  endsOnShortLabel: "15 Nov",
  endsAt: "2026-11-15T23:59:59+05:30",
  href: "/shop",
  couponCode: "DIWALI15" as string | null,
  heroAnimationEnabled: true,
} as const;

export type Campaign = typeof DIWALI_CAMPAIGN;

export function isCampaignActive(now: number = Date.now()): boolean {
  if (!DIWALI_CAMPAIGN.enabled) return false;
  const endsAt = Date.parse(DIWALI_CAMPAIGN.endsAt);
  return Number.isFinite(endsAt) && now < endsAt;
}
