"use client";

import Script from "next/script";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { sanitizeExchangeHref } from "@/lib/payments/exchange-href";

const GTM_ID = process.env.NEXT_PUBLIC_GTM_ID;

/**
 * Telemetry URL sanitization.
 *
 * The guest payment capability is a bearer credential carried as
 * `?pay=<token>` on the order-success URL. Analytics SDKs read
 * `location.href` themselves and would ship that token to a third party,
 * where it grants the private order view and payment initiation. Strip the
 * query and fragment so only origin + pathname are reported.
 *
 * This only rewrites the URL handed to the SDK. The browser address bar is
 * never touched, so the capability still reaches the page, pay-inline, and the
 * confirmation-email recovery link. Each integration uses its own
 * vendor-supported hook rather than a timing-based `history.replaceState`:
 *
 *  - Umami: `data-exclude-search` / `data-exclude-hash` on the script tag.
 *  - Vercel Analytics / Speed Insights: the `beforeSend` prop.
 *
 * Both Vercel wrappers register `beforeSend` before appending their script and
 * before their first pageview/vitals send, so the automatic initial payload is
 * covered too — no race, no `useEffect` of our own.
 *
 * GTM has no such hook: it records `page_location` from `location.href` and the
 * container is configured remotely. The one route whose URL carries a credential
 * — the exchange interstitial and its `?code=` — therefore rewrites the address
 * bar at hydration, before this lazyOnload script fires. See
 * `order/success/[orderNumber]/exchange/ExchangeContinue.tsx`.
 */
function sanitizeTelemetryUrl(raw: string): string {
  const withoutCode = sanitizeExchangeHref(raw);
  try {
    const url = new URL(withoutCode);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    // Relative or otherwise unparseable: drop everything from the first
    // delimiter so a token can never survive.
    return withoutCode.split(/[?#]/)[0];
  }
}

/** Shared by both Vercel SDKs: their event shapes are `{ type, url }`. */
function sanitizeTelemetryEvent<T extends { url: string }>(event: T): T {
  return { ...event, url: sanitizeTelemetryUrl(event.url) };
}

export default function Analytics() {
  if (!GTM_ID) {
    return (
      <>
        <Script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="390b58fa-d7bc-4b68-a2ff-11aafad50476"
          data-exclude-search="true"
          data-exclude-hash="true"
          strategy="lazyOnload"
        />
        <VercelAnalytics beforeSend={sanitizeTelemetryEvent} />
        <SpeedInsights beforeSend={sanitizeTelemetryEvent} />
      </>
    );
  }

  return (
    <>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>
      <Script
        defer
        src="https://cloud.umami.is/script.js"
        data-website-id="390b58fa-d7bc-4b68-a2ff-11aafad50476"
        data-exclude-search="true"
        data-exclude-hash="true"
        strategy="lazyOnload"
      />
      <Script
        async
        src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}
        strategy="lazyOnload"
      />
      <VercelAnalytics beforeSend={sanitizeTelemetryEvent} />
      <SpeedInsights beforeSend={sanitizeTelemetryEvent} />
    </>
  );
}
