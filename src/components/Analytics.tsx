import Script from "next/script";
import { Analytics as VercelAnalytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function Analytics() {
  return (
    <>
      <Script
        defer
        src="https://cloud.umami.is/script.js"
        data-website-id="390b58fa-d7bc-4b68-a2ff-11aafad50476"
        strategy="afterInteractive"
      />
      <VercelAnalytics />
      <SpeedInsights />
    </>
  );
}
