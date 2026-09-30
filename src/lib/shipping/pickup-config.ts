import type { PickupLocation } from "@/lib/shipping/delhivery";

/**
 * Delhivery pickup (warehouse) configuration — server-only, env-first.
 *
 * Historically this lived in SiteSetting["delhivery_pickup"] and was edited
 * from Admin → Settings. That UI is gone: the environment is now the
 * authoritative source. The legacy DB row is still read as a FALLBACK so a
 * deployment that never set the env vars keeps working (delhivery_pickup is
 * populated in production). Env wins whenever it is set.
 *
 * Never import this from a client component — it holds the warehouse phone,
 * email and street address. (No `import "server-only"` here because that specifier
 * is a Next-internal alias that cannot be resolved by the tsx check script; the
 * real guarantee is that Next only inlines NEXT_PUBLIC_* into client bundles,
 * so these values are always undefined client-side. Verified by grepping the
 * production build output in the admin security check.)
 */

/** Raw env string, or undefined when unset/blank (so DB fallback still runs). */
const env = (v: string | undefined): string | undefined =>
  v === undefined || v.trim() === "" ? undefined : v.trim();

/** Picks the env value when present, else the legacy DB value, else a default. */
function pick(
  envValue: string | undefined,
  dbValue: string | undefined,
  fallback = "",
): string {
  return envValue ?? dbValue ?? fallback;
}

/**
 * Resolves the pickup location sent to Delhivery. `legacy` is the previously
 * stored SiteSetting JSON (may be null) and is used only for fields the
 * environment does not define.
 */
export function resolvePickupLocation(
  legacy: Partial<PickupLocation> | null,
): {
  name: string;
  add: string;
  city: string;
  pin_code: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  registered_name: string;
  returnAdd: string;
  returnPin: string;
  returnCity: string;
  returnState: string;
  returnCountry: string;
} {
  const name = pick(env(process.env.DELHIVERY_PICKUP_NAME), legacy?.name);
  const add = pick(env(process.env.DELHIVERY_PICKUP_ADDRESS), legacy?.address);
  const city = pick(env(process.env.DELHIVERY_PICKUP_CITY), legacy?.city);
  // DELHIVERY_PICKUP_PIN matches the existing project convention; fall back to
  // DELHIVERY_ORIGIN_PINCODE, which the quotation API already treats as the
  // seller origin.
  const pin = pick(
    env(process.env.DELHIVERY_PICKUP_PIN) ??
      env(process.env.DELHIVERY_ORIGIN_PINCODE),
    legacy?.pin,
  );
  const state = pick(env(process.env.DELHIVERY_PICKUP_STATE), legacy?.state);
  const country = pick(
    env(process.env.DELHIVERY_PICKUP_COUNTRY),
    legacy?.country,
    "India",
  );
  const phone = pick(env(process.env.DELHIVERY_PICKUP_PHONE), legacy?.phone);
  const email = pick(env(process.env.DELHIVERY_PICKUP_EMAIL), legacy?.email);

  // Registered client-warehouse name; defaults to the pickup name, matching
  // what the old settings form did when the field was left blank.
  const registeredName = pick(
    env(process.env.DELHIVERY_PICKUP_ACCOUNT_NAME),
    legacy?.registeredName,
    name,
  );

  return {
    name,
    add,
    city,
    pin_code: pin,
    state,
    country,
    phone,
    email,
    registered_name: registeredName,
    // Return leg is env-first like the pickup leg: DELHIVERY_PICKUP_RETURN_*
    // wins, then the legacy return-* row, then the pickup value itself so RTO
    // packages always have an address.
    returnAdd: pick(
      env(process.env.DELHIVERY_PICKUP_RETURN_ADDRESS),
      legacy?.returnAddress,
      add,
    ),
    returnPin: pick(
      env(process.env.DELHIVERY_PICKUP_RETURN_PIN),
      legacy?.returnPin,
      pin,
    ),
    returnCity: pick(
      env(process.env.DELHIVERY_PICKUP_RETURN_CITY),
      legacy?.returnCity,
      city,
    ),
    returnState: pick(
      env(process.env.DELHIVERY_PICKUP_RETURN_STATE),
      legacy?.returnState,
      state,
    ),
    returnCountry: pick(
      env(process.env.DELHIVERY_PICKUP_RETURN_COUNTRY),
      legacy?.returnCountry,
      country,
    ),
  };
}

/** True when no pickup name AND no pickup pin is configured anywhere. */
export function pickupLocationMissing(
  p: ReturnType<typeof resolvePickupLocation>,
): boolean {
  return !p.name && !p.pin_code;
}
