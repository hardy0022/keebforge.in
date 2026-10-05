"use client";

import { useEffect, useState } from "react";
import { sanitizeExchangeHref } from "@/lib/payments/exchange-href";

/**
 * Drop `?code=` from the address bar before GTM reads the URL.
 *
 * The root layout loads GTM, which has no per-event URL sanitiser (unlike Umami
 * and the Vercel SDKs) and records `page_location` from `location.href`. On every
 * other route the query is empty, but here it carries a live redemption code.
 * GTM is `lazyOnload`, so it fires on the window load event; this effect runs at
 * hydration, well before that.
 *
 * Only the URL is rewritten. The code was already rendered into this component's
 * props, so the Continue button still has it and the flow is unaffected.
 */
function stripCodeFromUrl() {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", sanitizeExchangeHref(window.location.href));
}

/**
 * Explicit Continue button for the email exchange interstitial.
 *
 * Deliberately a POST that does not navigate on its own: the code is spent by
 * this click and nowhere else. On success we replace the history entry so the
 * code leaves the address bar and cannot be re-shared from there.
 */
export function ExchangeContinue({
  orderNumber,
  code,
}: {
  orderNumber: string | null;
  code: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    stripCodeFromUrl();
  }, []);

  if (!orderNumber || !code) {
    return (
      <a className="btn-ghost btn-sm" href="/track-order">
        Track an order
      </a>
    );
  }

  async function continueToOrder() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, code }),
      });
      const data = (await res.json().catch(() => null)) as
        | { orderNumber?: string }
        | null;
      if (!res.ok || !data?.orderNumber) {
        // One message for an expired, spent, wrong or unknown code. The customer
        // cannot tell them apart either, so neither can anyone probing.
        setError(
          "This link is no longer valid. Open the most recent confirmation email, or contact support with your order number.",
        );
        setBusy(false);
        return;
      }
      window.location.replace(`/order/success/${data.orderNumber}`);
    } catch {
      setError(
        "Could not reach the server. Check your connection and try again.",
      );
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn-prime btn-sm"
        onClick={() => void continueToOrder()}
        disabled={busy}
      >
        {busy ? "Opening…" : "Continue to payment"}
      </button>
      {error && (
        <p role="alert" className="os-pay-err">
          {error}
        </p>
      )}
    </>
  );
}