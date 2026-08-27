"use client";

/**
 * Razorpay EMI² Affordability Widget (Native Web integration).
 * Docs: https://razorpay.com/docs/payments/payment-gateway/emi²/widget/native-web/
 *
 * Official integration surface (nothing invented):
 *   1. <script src="https://cdn.razorpay.com/widgets/affordability/affordability.js">
 *   2. <div id="razorpay-affordability-widget">
 *   3. new RazorpayAffordabilitySuite({ key, amount, ... }).render()
 *
 * The widget fetches EMI/Cardless-EMI/Pay Later plans and offers with the
 * PUBLIC Key ID only — no secrets involved. Plans/offers/banks come from the
 * Razorpay Dashboard; nothing is hardcoded here.
 *
 * Shows only when a real payable amount exists; hides itself on any failure so
 * checkout never breaks.
 */

import { useEffect, useState } from "react";

const SCRIPT_SRC = "https://cdn.razorpay.com/widgets/affordability/affordability.js";
// Exact id required by Razorpay's Native Web integration.
const WIDGET_ID = "razorpay-affordability-widget";
// KeebForge lime — same accent passed to the Razorpay Checkout modal theme.
const THEME_COLOR = "#c9f31d";

let scriptPromise: Promise<boolean> | null = null;

/** Loads the CDN script exactly once; resolves false on failure (retryable). */
function loadWidgetScript(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.RazorpayAffordabilitySuite) return Promise.resolve(true);
  if (!scriptPromise) {
    scriptPromise = new Promise<boolean>((resolve) => {
      const el = document.createElement("script");
      el.src = SCRIPT_SRC;
      el.async = true;
      el.onload = () => resolve(Boolean(window.RazorpayAffordabilitySuite));
      el.onerror = () => resolve(false);
      document.body.appendChild(el);
    });
    void scriptPromise.then((ok) => {
      if (!ok) scriptPromise = null; // allow a retry on next mount
    });
  }
  return scriptPromise;
}

export function AffordabilityWidget({ amountPaise, keyId }: { amountPaise: number | null; keyId: string | null }) {
  // loading = skeleton; ready = Razorpay markup live; failed = hide entirely.
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const active = amountPaise != null && amountPaise > 0 && Boolean(keyId);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    void loadWidgetScript().then((loaded) => {
      if (!alive) return;
      if (!loaded) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[razorpay] Affordability widget unavailable: CDN script failed to load.");
        }
        setState("failed");
        return;
      }
      try {
        // ponytail: no documented update()/destroy() API — re-instantiate with the
        // final amount per docs ("pass the final amount in paise to the widget").
        document.getElementById(WIDGET_ID)?.replaceChildren();
        new window.RazorpayAffordabilitySuite({
          key: keyId as string,
          amount: amountPaise as number,
          currency: "INR",
          theme: { color: THEME_COLOR },
          display: {
            offers: true,
            emi: true,
            paylater: true,
            widget: {
              main: {
                isDarkMode: true,
                heading: { color: "#f5f5fa", fontSize: "13px" },
                content: { color: "#aeaebc", fontSize: "12px", backgroundColor: "#15131f" },
                discount: { color: "#c9f31d" },
                link: { button: false, color: "#c9f31d", fontSize: "12px" },
                footer: { color: "#71717a", fontSize: "11px", darkLogo: true },
              },
            },
          },
        }).render();
        setState("ready");
      } catch (err) {
        if (process.env.NODE_ENV !== "production") {
          console.warn("[razorpay] Affordability widget failed to render:", err);
        }
        setState("failed");
      }
    });
    return () => {
      alive = false;
    };
  }, [active, amountPaise, keyId]);

  if (!active || state === "failed") return null;

  return (
    <div className="kp-affordability">
      {state === "loading" && (
        <div className="kp-affordability-skel" aria-hidden="true">
          <div className="skeleton h-3 w-36" />
          <div className="skeleton h-8 w-full mt-2" />
          <div className="skeleton h-8 w-full mt-2" />
        </div>
      )}
      <div id={WIDGET_ID} />
      {state === "loading" && (
        <p className="text-xs text-[var(--t3)] text-center mt-2">Checking EMI &amp; Pay Later options…</p>
      )}
    </div>
  );
}
