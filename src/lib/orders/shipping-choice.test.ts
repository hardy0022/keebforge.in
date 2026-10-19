/**
 * Offline regression suite for the admin shipping-choice reader.
 *
 * Guards that the customer's pickup-vs-ship choice is surfaced for SERVICE and
 * REPAIR orders, that delivery speed is labelled (not shown raw), and that
 * every malformed / legacy shape fails closed instead of inventing a choice.
 *
 * Run: npm run check:shipping-choice
 */
import {
  modsShippingMethodLabel,
  parseModsShipping,
  parseRepairShipping,
  repairShippingMethodLabel,
  shippingChoiceRows,
  shippingSpeedLabel,
} from "@/lib/orders/shipping-choice";

function run() {
  let failed = 0;
  const t = (cond: boolean, tag: string) => {
    if (!cond) {
      console.error(`FAIL: ${tag}`);
      failed += 1;
    }
  };

  // ── SERVICE (mods) ────────────────────────────────────────────────────────
  const modsPickup = {
    deviceType: "KEYBOARD",
    modsShipping: {
      method: "pickup",
      mode: "express",
      totalPaise: 57500,
      destinationPincode: "181206",
    },
  };
  const pickup = parseModsShipping(modsPickup);
  t(pickup?.method === "pickup", "mods: pickup parsed");
  t(pickup?.mode === "express", "mods: speed parsed");
  t(
    modsShippingMethodLabel("pickup") === "Pickup by KeebForge",
    "mods: pickup label",
  );
  t(
    modsShippingMethodLabel("customer_shipping") === "Customer ships device",
    "mods: customer_shipping label",
  );

  const rows = shippingChoiceRows({ type: "SERVICE", summary: modsPickup });
  t(rows.length === 1, "mods: exactly one delivery row");
  t(
    rows[0].label === "How device reaches us" &&
      rows[0].value === "Pickup by KeebForge",
    "mods: row shows the pickup choice",
  );

  const selfShip = shippingChoiceRows({
    type: "SERVICE",
    summary: { modsShipping: { method: "customer_shipping", mode: "surface" } },
  });
  t(
    selfShip[0].value === "Customer ships device",
    "mods: self-ship row labelled",
  );

  // undecided is a real choice, not an error.
  const undecided = shippingChoiceRows({
    type: "SERVICE",
    summary: { modsShipping: { method: "undecided" } },
  });
  t(undecided[0].value === "To be decided", "mods: undecided labelled");

  // ── REPAIR ────────────────────────────────────────────────────────────────
  t(
    parseRepairShipping({ shippingMethod: "PICKUP" }) === "PICKUP",
    "repair: PICKUP parsed",
  );
  t(
    parseRepairShipping({ shippingMethod: "UNSURE" }) === "UNSURE",
    "repair: UNSURE parsed",
  );
  t(
    repairShippingMethodLabel("PICKUP") === "Pickup requested" &&
      repairShippingMethodLabel("SHIP") === "Customer ships device" &&
      repairShippingMethodLabel("UNSURE") === "Not sure yet",
    "repair: labels",
  );
  const repairRows = shippingChoiceRows({
    type: "REPAIR",
    summary: { shippingMethod: "PICKUP", serviceType: "repair" },
  });
  t(
    repairRows.length === 1 && repairRows[0].value === "Pickup requested",
    "repair: row shows the pickup choice",
  );

  // ── PRODUCT / no choice ───────────────────────────────────────────────────
  t(
    shippingChoiceRows({
      type: "PRODUCT",
      summary: null,
    }).length === 0,
    "product: no method row (speed shown by the panel)",
  );

  // ── Speed labels ──────────────────────────────────────────────────────────
  t(shippingSpeedLabel("surface") === "Surface", "speed: lowercase surface");
  t(shippingSpeedLabel("Express") === "Express", "speed: capitalized express");
  t(shippingSpeedLabel("") === "", "speed: empty => empty");
  t(shippingSpeedLabel(null) === "", "speed: null => empty");
  t(shippingSpeedLabel("weird") === "weird", "speed: unknown passes through");

  // ── Fail-closed ───────────────────────────────────────────────────────────
  t(parseModsShipping(null) === null, "mods: null summary => null");
  t(parseModsShipping({}) === null, "mods: missing key => null");
  t(parseModsShipping({ modsShipping: null }) === null, "mods: null block => null");
  t(
    parseModsShipping({ modsShipping: { method: "hacked" } }) === null,
    "mods: unknown method => null",
  );
  t(
    shippingChoiceRows({ type: "SERVICE", summary: { modsShipping: { method: 1 } } })
      .length === 0,
    "mods: numeric method => no row",
  );
  t(parseRepairShipping(null) === null, "repair: null summary => null");
  t(
    parseRepairShipping({ shippingMethod: "PICKUP " }) === null,
    "repair: whitespace variant => null (stored values are exact)",
  );
  t(
    shippingChoiceRows({ type: "REPAIR", summary: { serviceType: "repair" } })
      .length === 0,
    "repair: legacy order without the field => no row",
  );

  const msg =
    failed === 0
      ? "ok: all shipping-choice checks passed"
      : `${failed} shipping-choice check(s) FAILED`;
  if (failed === 0) console.log(msg);
  else console.error(msg);
  if (failed > 0) process.exitCode = 1;
}

if (
  process.argv[1]?.endsWith("orders/shipping-choice.test.ts") ||
  process.argv[1]?.endsWith("orders/shipping-choice.test.js")
) {
  run();
}
