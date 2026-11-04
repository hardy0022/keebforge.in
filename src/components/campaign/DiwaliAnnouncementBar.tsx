"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Campaign } from "@/lib/config/campaign";

/**
 * Compact storefront announcement. The server decides whether the campaign is
 * active; this component additionally schedules the hide at the exact end
 * time so statically cached pages cannot keep showing an expired offer.
 *
 * Visual hierarchy: 15% OFF (focal) → DIWALI15 (claim) → expiry. The coupon
 * badge is the only interactive copy target; the rest of the ribbon links to
 * the shop, so copying never hijacks normal navigation.
 */
export function DiwaliAnnouncementBar({ campaign }: { campaign: Campaign }) {
  const [visible, setVisible] = useState(true);
  const [copied, setCopied] = useState(false);

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

  async function copyCode() {
    if (!campaign.couponCode) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(campaign.couponCode);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = campaign.couponCode;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand("copy");
        document.body.removeChild(textarea);
        if (!success) throw new Error("Copy failed");
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable (permission/old browser) — fail silently.
    }
  }

  const offerLabel = `${campaign.discountPercent}% off`;
  const claimLabel = campaign.couponCode
    ? ` with code ${campaign.couponCode} at checkout`
    : "";

  return (
    <aside className="kf-promo" aria-label="Current promotion">
      <span className="kf-promo-spark kf-promo-spark-l" aria-hidden="true">
        ✦
      </span>
      <span className="kf-promo-spark kf-promo-spark-r" aria-hidden="true">
        ✦
      </span>

      <div className="kf-promo-inner">
        <Link
          href={campaign.href}
          className="kf-promo-main"
          aria-label={`${campaign.title}: ${offerLabel}${claimLabel}, till ${campaign.endsOnLabel}. Shop now.`}
        >
          <span className="kf-promo-diya" aria-hidden="true">
            🪔
          </span>
          <span className="kf-promo-title">{campaign.title}</span>
          <span className="kf-promo-sep" aria-hidden="true" />
          <span className="kf-promo-off">{campaign.discountPercent}% OFF</span>
        </Link>

        <span className="kf-promo-sep" aria-hidden="true" />

        {campaign.couponCode ? (
          <button
            type="button"
            className="kf-promo-code"
            data-copied={copied ? "true" : undefined}
            onClick={copyCode}
            aria-label={
              copied
                ? "Coupon code copied"
                : `Copy coupon code ${campaign.couponCode}`
            }
            title="Copy code"
          >
            <span className="kf-promo-code-key" aria-hidden="true">
              Code
            </span>
            <span className="kf-promo-code-value">
              {copied ? "Copied!" : campaign.couponCode}
            </span>
          </button>
        ) : null}

        <span className="kf-promo-sep" aria-hidden="true" />

        <span className="kf-promo-meta">
          <span className="kf-promo-meta-action">Use at checkout</span>
          <span className="kf-promo-meta-dot" aria-hidden="true">
            ·
          </span>
          <span className="kf-promo-until-long">
            Till {campaign.endsOnLabel}
          </span>
          <span className="kf-promo-until-short">
            Till {campaign.endsOnShortLabel}
          </span>
        </span>

        <Link
          href={campaign.href}
          className="kf-promo-shop"
          aria-label="Shop now"
        >
          <span className="kf-promo-arrow" aria-hidden="true">
            →
          </span>
        </Link>
      </div>

      <span className="sr-only" role="status" aria-live="polite">
        {copied ? "Coupon code copied" : ""}
      </span>
    </aside>
  );
}
