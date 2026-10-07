/**
 * Mods/services shipping leg derivation, shared by the /mods preview and the
 * server-side recalculation so display and charge always match. Isomorphic on
 * purpose — the client never invents an amount, it only selects between the two
 * amounts the server quoted from Delhivery.
 *
 * A services order has two physically distinct legs:
 *
 *   pickup  (only when the customer picks "Need pickup")
 *           Delhivery collects the device from the CUSTOMER and delivers it to
 *           the workshop  → Delhivery sub-service `ss=DTO`, which the Delhivery
 *           One rate calculator labels "Reverse Pickup (RVP)".
 *   return
 *           Delhivery collects the repaired device from the WORKSHOP and
 *           delivers it back to the CUSTOMER → `ss=Delivered`, the dashboard's
 *           "Forward" tab.
 *
 * `ss=RTO` is NOT the return leg: it prices a FAILED forward delivery coming
 * back to the seller. Using it here would charge the customer for a bounce.
 *
 * Both amounts must come from the provider. This module previously estimated
 * the pickup leg as 1.5× the forward rate; that multiplier is gone — an
 * invented factor cannot match Delhivery's rate card (measured on
 * 181206↔575002 / 1400 g: DTO surface ₹344.94 vs a fabricated 1.5 × ₹229.93).
 */

export type ServiceShippingMethod = "pickup" | "customer_shipping";

export type ServiceLegs = {
  pickupPaise: number;
  returnPaise: number;
  totalPaise: number;
};

/** Server-quoted amounts for a services order, in integer paise. */
export type QuotedServiceLegs = {
  /** Reverse pickup (customer → workshop). null when the provider gave none. */
  pickupPaise: number | null;
  /** Forward return leg (workshop → customer). */
  returnPaise: number | null;
};

/**
 * Selects the legs a customer is charged for a shipping method.
 *
 * Returns null when a leg the method actually needs was not quoted, so callers
 * hide the amounts instead of displaying ₹0 — charging nothing for a real
 * collection would be a silent revenue loss.
 */
export function deriveLegs(
  quote: QuotedServiceLegs,
  method: ServiceShippingMethod,
): ServiceLegs | null {
  const returnPaise = quote.returnPaise;
  if (returnPaise === null || !Number.isFinite(returnPaise) || returnPaise < 0)
    return null;

  if (method !== "pickup") {
    // Customer ships the device themselves: we only quote the way back.
    return { pickupPaise: 0, returnPaise, totalPaise: returnPaise };
  }

  const pickupPaise = quote.pickupPaise;
  if (pickupPaise === null || !Number.isFinite(pickupPaise) || pickupPaise < 0)
    return null;
  return {
    pickupPaise,
    returnPaise,
    totalPaise: pickupPaise + returnPaise,
  };
}
