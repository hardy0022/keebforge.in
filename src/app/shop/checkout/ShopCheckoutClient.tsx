"use client";

import { ProductCheckout } from "@/app/checkout/CheckoutClient";

export default function ShopCheckoutClient({
  shippingModes,
  razorpayKeyId,
}: {
  shippingModes: ("surface" | "express")[];
  razorpayKeyId: string | null;
}) {
  return <ProductCheckout shippingModes={shippingModes} razorpayKeyId={razorpayKeyId} />;
}
