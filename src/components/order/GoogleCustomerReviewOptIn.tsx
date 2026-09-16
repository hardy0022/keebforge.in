"use client";

import Script from "next/script";

// Google Customer Reviews opt-in survey (Google Merchant Center / Merchant
// Reviews program). Loaded ONLY on the paid order-success confirmation page
// after a successful payment — never globally.
//
// Data is the real, authorized order snapshot: order_number, customer email,
// delivery country and the authoritative Delhivery-estimated delivery date
// (the same value the tracking page renders). Nothing is invented, logged,
// or written to any URL.
//
// No GTIN: KeefForge products have no GTIN/GTIN data, so `products` would
// only carry fabricated identifiers — the GCR `products` field is therefore
// OMITTED entirely. Do not add SKU/ID as GTIN.
const MERCHANT_ID = "5853425770";

declare global {
  interface Window {
    gapi?: {
      load: (lib: string, cb: () => void) => void;
      surveyoptin?: {
        render: (config: {
          merchant_id: string;
          order_id: string;
          email: string;
          delivery_country: string;
          estimated_delivery_date: string;
        }) => void;
      };
    };
    renderOptIn?: () => void;
  }
}

type Props = {
  orderNumber: string;
  email: string;
  deliveryCountry: string;
  estimatedDeliveryDate: string; // YYYY-MM-DD, authoritative (Delhivery EDD)
};

export function GoogleCustomerReviewOptIn({
  orderNumber,
  email,
  deliveryCountry,
  estimatedDeliveryDate,
}: Props) {
  const config = JSON.stringify({
    merchant_id: MERCHANT_ID,
    order_id: orderNumber,
    email,
    delivery_country: deliveryCountry,
    estimated_delivery_date: estimatedDeliveryDate,
  });

  return (
    <>
      <Script id="gcr-renderOptIn" strategy="afterInteractive">
        {`window.renderOptIn=function(){if(!window.gapi||!window.gapi.load||!window.gapi.surveyoptin)return;window.gapi.surveyoptin.render(${config});};`}
      </Script>
      <Script
        src="https://apis.google.com/js/platform.js?onload=renderOptIn"
        strategy="afterInteractive"
      />
    </>
  );
}
