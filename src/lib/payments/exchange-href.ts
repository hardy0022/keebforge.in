import { EXCHANGE_PARAM } from "@/lib/payments/order-capability";

/**
 * Strip `?code=` from a URL so no analytics SDK can record it.
 *
 * The root layout loads GTM, which has no per-event URL sanitiser (unlike Umami
 * and the Vercel SDKs — see `components/Analytics.tsx`) and derives
 * `page_location` from `location.href`. On every other route the query is empty,
 * but the exchange interstitial's carries a live redemption code. GTM is
 * `lazyOnload`, so it fires on the window load event; the interstitial rewrites
 * the address bar at hydration, well before that.
 *
 * Only the `code` parameter is removed — other query params and the fragment
 * survive, so this stays a targeted scrub rather than a blanket redirect.
 */
export function sanitizeExchangeHref(href: string): string {
  try {
    const url = new URL(href);
    if (!url.searchParams.has(EXCHANGE_PARAM)) return href;
    url.searchParams.delete(EXCHANGE_PARAM);
    const rest = url.searchParams.toString();
    return `${url.pathname}${rest ? `?${rest}` : ""}${url.hash}`;
  } catch {
    // Relative or otherwise unparseable: drop from the first delimiter so a code
    // can never survive.
    return href.split(/[?#]/)[0];
  }
}