"use client";

import { usePublicSettings } from "@/components/layout/public-settings";

/**
 * "Accepting Orders" pill in the footer. Split out of `SiteFooter` and moved to
 * the client so the root layout stops importing Prisma for it.
 *
 * While the request is in flight nothing is rendered. The old server-side read
 * had no loading phase, so there is no prior value to fall back to — showing
 * "Accepting Orders" during load would briefly assert a state the site is not
 * in whenever orders are actually paused. An empty span costs one line box
 * until the value lands, which is cheaper than lying about it.
 *
 * A failed or unreadable request still renders: `usePublicSettings` resolves to
 * FALLBACK on error, not to `null`, so the pill shows the same "Accepting
 * Orders" the old read showed when the value was missing.
 */
export function FooterStatus() {
  const settings = usePublicSettings();
  if (settings === null) return null;

  const accepting = settings.acceptingOrders;

  return (
    <span className="footer-status">
      <span className="footer-status-dot" data-off={!accepting || undefined} />
      {accepting ? "Accepting Orders" : "Not Accepting Orders"}
    </span>
  );
}
