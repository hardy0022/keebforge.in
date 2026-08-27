import { Suspense } from "react";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";
import { enabledShippingModes } from "@/lib/shipping";
import ShopCheckoutClient from "./ShopCheckoutClient";

export const metadata: Metadata = buildMetadata({
  title: "Checkout | KeebForge",
  description:
    "Review your cart, enter delivery details and pay securely via Razorpay.",
  path: "/shop/checkout",
});

export const dynamic = "force-dynamic";

export default function ShopCheckoutPage() {
  return (
    <Suspense fallback={
      <main>
        <div className="wrap pt-8 pb-16" style={{ textAlign: "center" }}>
          <div className="skeleton h-4 w-48 mx-auto mb-8" style={{ borderRadius: "var(--r-sm)" }} />
          <div className="skeleton h-64 w-full max-w-3xl mx-auto" style={{ borderRadius: "var(--r-lg)" }} />
        </div>
      </main>
    }>
      <ShopCheckoutClient
        shippingModes={enabledShippingModes()}
        razorpayKeyId={process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID ?? null}
      />
    </Suspense>
  );
}
