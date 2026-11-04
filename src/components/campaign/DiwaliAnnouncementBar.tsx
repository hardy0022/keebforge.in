"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/config/campaign";
import { DiwaliFireworks } from "./DiwaliFireworks";

/**
 * Compact storefront announcement. The server decides whether the campaign is
 * active; this component additionally schedules the hide at the exact end
 * time so statically cached pages cannot keep showing an expired offer.
 */
export function DiwaliAnnouncementBar({ campaign }: { campaign: Campaign }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const endsAt = Date.parse(campaign.endsAt);
    if (!Number.isFinite(endsAt)) return;

    const remaining = endsAt - Date.now();
    const timer = window.setTimeout(
      () => setVisible(false),
      Math.max(0, remaining),
    );
    return () => window.clearTimeout(timer);
  }, [campaign.endsAt]);

  if (!visible) return null;

  const offerLabel = `${campaign.discountPercent}% off`;
  const claimLabel = campaign.couponCode
    ? ` with code ${campaign.couponCode} at checkout`
    : "";

  return (
    <aside className="kf-promo" aria-label="Current promotion">
      <DiwaliFireworks />
      <Link
        href={campaign.href}
        className="kf-promo-link"
        aria-label={`${campaign.title}: ${offerLabel}${claimLabel}, till ${campaign.endsOnLabel}. Shop now.`}
      >
        <span className="kf-promo-diya" aria-hidden="true">
          🪔
        </span>
        <span className="kf-promo-text kf-promo-text-desktop">
          <span className="kf-promo-title">{campaign.title}</span>
          <span className="kf-promo-dot" aria-hidden="true">
            ·
          </span>
          <span className="kf-promo-off">{campaign.discountPercent}% OFF</span>
          {campaign.couponCode ? (
            <>
              <span className="kf-promo-dot" aria-hidden="true">
                ·
              </span>
              <span className="kf-promo-use">
                Use <span className="kf-promo-code">{campaign.couponCode}</span>{" "}
                at checkout
              </span>
            </>
          ) : null}
          <span className="kf-promo-dot" aria-hidden="true">
            ·
          </span>
          <span className="kf-promo-until">Till {campaign.endsOnLabel}</span>
        </span>
        <span className="kf-promo-text kf-promo-text-mobile">
          <span className="kf-promo-off">{campaign.discountPercent}% OFF</span>
          {campaign.couponCode ? (
            <>
              <span className="kf-promo-dot" aria-hidden="true">
                ·
              </span>
              <span className="kf-promo-use">
                Code: <span className="kf-promo-code">{campaign.couponCode}</span>
              </span>
            </>
          ) : null}
          <span className="kf-promo-dot" aria-hidden="true">
            ·
          </span>
          <span className="kf-promo-until">
            Till {campaign.endsOnShortLabel}
          </span>
        </span>
        <span className="kf-promo-arrow" aria-hidden="true">
          →
        </span>
      </Link>
    </aside>
  );
}
