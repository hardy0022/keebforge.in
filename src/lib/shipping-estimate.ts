/**
 * Mods shipping leg derivation, shared by /mods preview and the server-side
 * recalculation so display and charge always match. Isomorphic on purpose.
 *
 * The Delhivery API exposes no reverse-pickup rate, so pickup shipping is
 * estimated as 1.5× the standard forward rate (origin → customer PIN),
 * rounded up to whole rupees.
 */

export const PICKUP_ESTIMATE_MULTIPLIER = 1.5;

export function deriveLegs(forwardPaise: number, method: "pickup" | "customer_shipping") {
  const returnPaise = forwardPaise;
  const pickupPaise =
    method === "pickup" ? Math.ceil((forwardPaise / 100) * PICKUP_ESTIMATE_MULTIPLIER) * 100 : 0;
  return { pickupPaise, returnPaise, totalPaise: pickupPaise + returnPaise };
}
