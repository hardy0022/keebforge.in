"use client";

import { useRef } from "react";
import type { AnimatedIconHandle } from "@/components/icons/types";
import TruckElectricIcon from "@/components/icons/truck-electric-icon";
import ShieldCheck from "@/components/icons/shield-check";

export function ShippingWarranty({
  shippingInfo,
  warrantyInfo,
}: {
  shippingInfo?: string | null;
  warrantyInfo?: string | null;
}) {
  const truckRef = useRef<AnimatedIconHandle>(null);
  const shieldRef = useRef<AnimatedIconHandle>(null);

  if (!shippingInfo && !warrantyInfo) return null;

  return (
    <section className="svc-section" aria-label="Shipping and warranty">
      <div className="wrap">
        <div className="product-details-grid product-details-grid--split">
          {shippingInfo && (
            <div
              className="product-section"
              onMouseEnter={() => truckRef.current?.startAnimation()}
              onMouseLeave={() => truckRef.current?.stopAnimation()}
            >
              <h2 className="product-section-title">
                <TruckElectricIcon ref={truckRef} size={22} strokeWidth={1.6} />
                Shipping
              </h2>
              <p className="product-shipping-info">{shippingInfo}</p>
            </div>
          )}
          {warrantyInfo && (
            <div
              className="product-section"
              onMouseEnter={() => shieldRef.current?.startAnimation()}
              onMouseLeave={() => shieldRef.current?.stopAnimation()}
            >
              <h2 className="product-section-title">
                <ShieldCheck ref={shieldRef} size={22} strokeWidth={1.6} />
                Warranty
              </h2>
              <p className="product-warranty-info">{warrantyInfo}</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}