"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ServiceCheckout } from "@/app/checkout/CheckoutClient";
import { SERVICE_CHECKOUT_KEY, type StoredServiceCheckout } from "@/components/mods/ModConfigurator";

export default function ModsCheckoutClient({ razorpayKeyId }: { razorpayKeyId: string | null }) {
  const router = useRouter();
  const [config, setConfig] = useState<StoredServiceCheckout | null>(null);
  const [loading, setLoading] = useState(true);

  // sessionStorage is only readable after mount, so this state sync is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SERVICE_CHECKOUT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredServiceCheckout;
        if (parsed && parsed.deviceType && Array.isArray(parsed.services) && parsed.services.length > 0) {
          setConfig(parsed);
        }
      }
    } catch {
      /* malformed — ignore */
    }
    setLoading(false);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) {
    return (
      <main className="checkout-page">
        <div className="wrap pt-8 pb-16" style={{ textAlign: "center" }}>
          <div className="skeleton h-4 w-48 mx-auto mb-8" style={{ borderRadius: "var(--r-sm)" }} />
          <div className="skeleton h-64 w-full max-w-3xl mx-auto" style={{ borderRadius: "var(--r-lg)" }} />
        </div>
      </main>
    );
  }

  if (!config) {
    return (
      <main className="checkout-page">
        <section className="svc-section">
          <div className="wrap">
            <p className="sec-num">{"// CHECKOUT"}</p>
            <h1 className="sec-title font-display mb-2">Mods Checkout</h1>
            <div className="card qcard p-10 text-center mt-8">
              <p className="ct mb-2">No mods configuration found</p>
              <p className="text-sm text-[var(--t3)] mb-2">Configure a mod first, then proceed to checkout.</p>
              <button
                type="button"
                className="btn-prime"
                style={{ width: "auto", paddingInline: 24, marginTop: 16 }}
                onClick={() => router.push("/mods")}
              >
                Go to Mods
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return <ServiceCheckout config={config} razorpayKeyId={razorpayKeyId} />;
}
