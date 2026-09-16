import Script from "next/script";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

// GTM container (GTM-PXPTM2BF). Also used for Google Merchant Center site
// verification; analytics tags/events can be configured inside the container.
const GTM_ID = "GTM-PXPTM2BF";

export default function Analytics() {
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
        strategy="afterInteractive"
      />
      <Script
        async
        src={`https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`}
        strategy="afterInteractive"
      />
      <VercelAnalytics />
      <SpeedInsights />
    </>
  );
}
