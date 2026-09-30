import {
  adminPanelEnabled,
  detectEnvironment,
  MAINTENANCE_KEY,
  type Environment,
} from "@/lib/config/environment";
import { resolvePickupLocation } from "@/lib/shipping/pickup-config";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

for (const h of ["keebforge.in", "www.keebforge.in", "shop.keebforge.in"])
  assert(
    detectEnvironment(h) === "production",
    `host ${JSON.stringify(h)} should be production`,
  );
for (const h of [
  "",
  "localhost",
  "localhost:3000",
  "127.0.0.1:3000",
  "192.168.1.10",
  "10.0.0.5",
  "0.0.0.0:3000",
  "dev.local",
])
  assert(
    detectEnvironment(h) === "development",
    `host ${JSON.stringify(h)} should be development`,
  );

assert(
  MAINTENANCE_KEY.production !== MAINTENANCE_KEY.development,
  "keys must be distinct",
);

// Simulate the proxy decision: host -> env -> that env's key only.
function blocked(
  host: string,
  settings: Record<Environment, boolean>,
): boolean {
  return settings[detectEnvironment(host)] === true;
}

const setUp = (p: boolean, d: boolean): Record<Environment, boolean> => ({
  production: p,
  development: d,
});

// prod OFF + dev OFF
assert(
  !blocked("keebforge.in", setUp(false, false)),
  "prod offline when prod OFF",
);
assert(
  !blocked("localhost:3000", setUp(false, false)),
  "dev offline when dev OFF",
);

// prod ON + dev OFF -> only production
assert(
  blocked("keebforge.in", setUp(true, false)),
  "prod blocked when prod ON",
);
assert(
  !blocked("localhost:3000", setUp(true, false)),
  "dev NOT affected by prod ON",
);

// prod OFF + dev ON -> only development
assert(
  !blocked("keebforge.in", setUp(false, true)),
  "prod NOT affected by dev ON",
);
assert(
  blocked("localhost:3000", setUp(false, true)),
  "dev blocked when dev ON",
);

// prod ON + dev ON -> both
assert(blocked("keebforge.in", setUp(true, true)), "prod blocked when both ON");
assert(
  blocked("localhost:3000", setUp(true, true)),
  "dev blocked when both ON",
);

console.log("maintenance isolation (4 cases) OK");

// ── Admin panel enablement ───────────────────────────────────────────────────
// Defaults must be ON for both environments: production admin access is
// required for the live order/shipment/review workflows.
const withEnv = <T>(vars: Record<string, string | undefined>, fn: () => T): T => {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
};

const PANEL_VARS = [
  "ADMIN_PANEL_ENABLED",
  "ADMIN_PANEL_PRODUCTION_ENABLED",
  "ADMIN_PANEL_DEVELOPMENT_ENABLED",
];

const noPanelVars = Object.fromEntries(PANEL_VARS.map((k) => [k, undefined]));

assert(
  withEnv(noPanelVars, () => adminPanelEnabled("keebforge.in")),
  "admin panel must default to ENABLED on a public host",
);
assert(
  withEnv(noPanelVars, () => adminPanelEnabled("localhost")),
  "admin panel must default to ENABLED on localhost",
);

// Per-environment switch: production off must NOT touch development — this is
// the "hide /admin on the public host, keep localhost working" requirement.
const prodOff = { ...noPanelVars, ADMIN_PANEL_PRODUCTION_ENABLED: "false" };
assert(
  withEnv(prodOff, () => !adminPanelEnabled("keebforge.in")),
  "ADMIN_PANEL_PRODUCTION_ENABLED=false must disable /admin on a public host",
);
assert(
  withEnv(prodOff, () => adminPanelEnabled("localhost")),
  "production off must NOT disable the localhost /admin panel",
);
assert(
  withEnv(prodOff, () => adminPanelEnabled("localhost:3000")),
  "the port is not a boundary: localhost:3000 stays development",
);

// Master switch off disables both; master switch on does not override a
// per-environment off.
assert(
  withEnv({ ...noPanelVars, ADMIN_PANEL_ENABLED: "false" }, () =>
    !adminPanelEnabled("keebforge.in") && !adminPanelEnabled("localhost"),
  ),
  "ADMIN_PANEL_ENABLED=false must disable both environments",
);
assert(
  withEnv({ ...prodOff, ADMIN_PANEL_ENABLED: "true" }, () =>
    !adminPanelEnabled("keebforge.in"),
  ),
  "per-environment false must win over master true",
);

// Blank is treated as unset, and the falsy spellings are all honoured.
for (const falsy of ["false", "FALSE", "0", "off", "no", " off "]) {
  assert(
    withEnv({ ...noPanelVars, ADMIN_PANEL_PRODUCTION_ENABLED: falsy }, () =>
      !adminPanelEnabled("keebforge.in"),
    ),
    `ADMIN_PANEL_PRODUCTION_ENABLED=${JSON.stringify(falsy)} must disable`,
  );
}
assert(
  withEnv({ ...noPanelVars, ADMIN_PANEL_PRODUCTION_ENABLED: "  " }, () =>
    adminPanelEnabled("keebforge.in"),
  ),
  "blank admin flag must fall back to the default (enabled)",
);

// Host spoofing: a crafted Host must not be able to select the development
// policy and reach /admin on a public host, so only an exact loopback name
// counts as development. An unknown or missing host fails closed.
for (const loopback of [
  "localhost",
  "127.0.0.1",
  "127.0.0.1:3000",
  "[::1]",
  "::1",
  "LOCALHOST",
  " localhost ",
]) {
  assert(
    withEnv(prodOff, () => adminPanelEnabled(loopback)),
    `${JSON.stringify(loopback)} must count as loopback/development`,
  );
}
for (const publicHost of [
  "keebforge.in",
  "localhost.evil.com",
  "evil-localhost.example.com",
  "www.keebforge.in",
  "KEEMBLFORGE.IN",
  "keebforge.in.evil.com",
  "10.0.0.5",
  "192.168.1.10",
  "keebforge.in:3000",
  "",
]) {
  assert(
    // Production disabled: these hosts must pick up the PRODUCTION flag. Were
    // they misread as loopback they would fall back to the (unset) master and
    // stay enabled.
    withEnv(prodOff, () => !adminPanelEnabled(publicHost)),
    `${JSON.stringify(publicHost)} must count as production, not loopback`,
  );
}

console.log("admin panel policy (28 cases) OK");

// ── Delhivery pickup resolution ──────────────────────────────────────────────
// Env is authoritative; the legacy DB row is only a per-field fallback.
const LEGACY_PICKUP = {
  name: "Legacy Warehouse",
  address: "1 Legacy St",
  city: "Legacyville",
  pin: "111111",
  state: "Legacy State",
  country: "Legacyland",
  phone: "9000000000",
  email: "legacy@example.com",
  registeredName: "LegacyRegistered",
};
// Same row plus the legacy return-* fields an older settings form stored.
const LEGACY = {
  ...LEGACY_PICKUP,
  returnAddress: "9 Legacy Return St",
  returnPin: "444444",
  returnCity: "Legacy Return City",
  returnState: "Legacy Return State",
  returnCountry: "Legacy Return Land",
};

const PICKUP_VARS = [
  "DELHIVERY_PICKUP_NAME",
  "DELHIVERY_PICKUP_ADDRESS",
  "DELHIVERY_PICKUP_CITY",
  "DELHIVERY_PICKUP_PIN",
  "DELHIVERY_PICKUP_STATE",
  "DELHIVERY_PICKUP_COUNTRY",
  "DELHIVERY_PICKUP_PHONE",
  "DELHIVERY_PICKUP_EMAIL",
  "DELHIVERY_PICKUP_ACCOUNT_NAME",
  "DELHIVERY_PICKUP_RETURN_ADDRESS",
  "DELHIVERY_PICKUP_RETURN_PIN",
  "DELHIVERY_PICKUP_RETURN_CITY",
  "DELHIVERY_PICKUP_RETURN_STATE",
  "DELHIVERY_PICKUP_RETURN_COUNTRY",
  "DELHIVERY_ORIGIN_PINCODE",
];
const noPickupVars = Object.fromEntries(
  PICKUP_VARS.map((k) => [k, undefined]),
);

// Env beats the DB row for the same field.
const resolved = withEnv(
  {
    ...noPickupVars,
    DELHIVERY_PICKUP_NAME: "Env Warehouse",
    DELHIVERY_PICKUP_ADDRESS: "2 Env Ave",
    DELHIVERY_PICKUP_CITY: "Envville",
    DELHIVERY_PICKUP_PIN: "222222",
    DELHIVERY_PICKUP_STATE: "Env State",
    DELHIVERY_PICKUP_COUNTRY: "Envland",
    DELHIVERY_PICKUP_PHONE: "9111111111",
    DELHIVERY_PICKUP_EMAIL: "env@example.com",
    DELHIVERY_PICKUP_ACCOUNT_NAME: "EnvRegistered",
  },
  () => resolvePickupLocation(LEGACY_PICKUP),
);
assert(resolved.name === "Env Warehouse", "env pickup name must win over DB");
assert(resolved.add === "2 Env Ave", "env pickup address must win over DB");
assert(resolved.city === "Envville", "env pickup city must win over DB");
assert(resolved.pin_code === "222222", "env pickup pin must win over DB");
assert(resolved.state === "Env State", "env pickup state must win over DB");
assert(resolved.country === "Envland", "env pickup country must win over DB");
assert(resolved.phone === "9111111111", "env pickup phone must win over DB");
assert(resolved.email === "env@example.com", "env pickup email must win over DB");
assert(
  resolved.registered_name === "EnvRegistered",
  "env pickup account name must win over DB",
);
// Return leg defaults to the pickup address.
assert(resolved.returnAdd === "2 Env Ave", "return address must default to pickup address");
assert(resolved.returnPin === "222222", "return pin must default to pickup pin");
assert(resolved.returnCity === "Envville", "return city must default to pickup city");
assert(resolved.returnState === "Env State", "return state must default to pickup state");
assert(resolved.returnCountry === "Envland", "return country must default to pickup country");

// Return leg is env-first too: DELHIVERY_PICKUP_RETURN_* beats the DB row.
const envReturn = withEnv(
  {
    ...noPickupVars,
    DELHIVERY_PICKUP_RETURN_ADDRESS: "3 Env Return Ave",
    DELHIVERY_PICKUP_RETURN_PIN: "555555",
    DELHIVERY_PICKUP_RETURN_CITY: "Env Return City",
    DELHIVERY_PICKUP_RETURN_STATE: "Env Return State",
    DELHIVERY_PICKUP_RETURN_COUNTRY: "Env Return Land",
  },
  () => resolvePickupLocation(LEGACY),
);
assert(envReturn.returnAdd === "3 Env Return Ave", "env return address must win over DB");
assert(envReturn.returnPin === "555555", "env return pin must win over DB");
assert(envReturn.returnCity === "Env Return City", "env return city must win over DB");
assert(envReturn.returnState === "Env Return State", "env return state must win over DB");
assert(envReturn.returnCountry === "Env Return Land", "env return country must win over DB");

// A blank return env var must NOT shadow the DB return row.
const blankReturnEnv = withEnv(
  {
    ...noPickupVars,
    DELHIVERY_PICKUP_RETURN_ADDRESS: "  ",
    DELHIVERY_PICKUP_RETURN_PIN: "",
  },
  () => resolvePickupLocation(LEGACY),
);
assert(
  blankReturnEnv.returnAdd === "9 Legacy Return St",
  "blank env return address must fall through to the DB value",
);
assert(
  blankReturnEnv.returnPin === "444444",
  "empty env return pin must fall through to the DB value",
);

// With no env set, the legacy DB row is still honoured field-by-field, so a
// deployment that never set the vars keeps shipping.
const legacyOnly = withEnv(noPickupVars, () => resolvePickupLocation(LEGACY));
assert(legacyOnly.name === "Legacy Warehouse", "legacy DB name must be the fallback");
assert(legacyOnly.pin_code === "111111", "legacy DB pin must be the fallback");
assert(
  legacyOnly.registered_name === "LegacyRegistered",
  "legacy registeredName must be the fallback",
);
assert(
  legacyOnly.returnAdd === "9 Legacy Return St",
  "legacy DB return address must be the fallback",
);
assert(legacyOnly.returnPin === "444444", "legacy DB return pin must be the fallback");
assert(
  legacyOnly.returnCity === "Legacy Return City",
  "legacy DB return city must be the fallback",
);
assert(
  legacyOnly.returnState === "Legacy Return State",
  "legacy DB return state must be the fallback",
);
assert(
  legacyOnly.returnCountry === "Legacy Return Land",
  "legacy DB return country must be the fallback",
);

// A blank env value must NOT shadow the DB value (whitespace-only included).
const blankEnv = withEnv(
  { ...noPickupVars, DELHIVERY_PICKUP_NAME: "   ", DELHIVERY_PICKUP_CITY: "" },
  () => resolvePickupLocation(LEGACY),
);
assert(
  blankEnv.name === "Legacy Warehouse",
  "blank env name must fall through to the DB value",
);
assert(
  blankEnv.city === "Legacyville",
  "empty env city must fall through to the DB value",
);

// Pin falls back to DELHIVERY_ORIGIN_PINCODE when neither pin var is set, and
// registered name defaults to the pickup name.
const originPin = withEnv(
  { ...noPickupVars, DELHIVERY_ORIGIN_PINCODE: "333333", DELHIVERY_PICKUP_NAME: "Only Name" },
  () => resolvePickupLocation(null),
);
assert(
  originPin.pin_code === "333333",
  "pin must fall back to DELHIVERY_ORIGIN_PINCODE",
);
assert(
  originPin.registered_name === "Only Name",
  "registered name must default to the pickup name",
);

// No env and no DB row -> empty strings, never undefined (no crash paths).
const nothing = withEnv(noPickupVars, () => resolvePickupLocation(null));
assert(nothing.name === "" && nothing.pin_code === "", "unconfigured pickup must be empty strings");
assert(nothing.country === "India", "country must default to India");
// The return leg must still resolve to the pickup values so RTO packages work.
assert(nothing.returnPin === nothing.pin_code, "return pin must track the pickup pin");
assert(nothing.returnAdd === nothing.add, "return address must track the pickup address");
assert(nothing.returnCity === nothing.city, "return city must track the pickup city");
assert(nothing.returnState === nothing.state, "return state must track the pickup state");
assert(nothing.returnCountry === "India", "return country must default to India");
// A DB row with blank return strings must stay blank (not silently replaced by
// the pickup value) — the pre-env behaviour is preserved field by field.
const blankLegacyReturn = withEnv(noPickupVars, () =>
  resolvePickupLocation({ ...LEGACY, returnPin: "" }),
);
assert(
  blankLegacyReturn.returnPin === "",
  "a blank DB return pin must stay blank, not fall back to the pickup pin",
);

console.log("delhivery pickup resolution (39 cases) OK");
