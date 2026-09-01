import { detectEnvironment, MAINTENANCE_KEY, type Environment } from "@/lib/environment";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}

for (const h of ["keebforge.in", "www.keebforge.in", "shop.keebforge.in"])
  assert(detectEnvironment(h) === "production", `host ${JSON.stringify(h)} should be production`);
for (const h of ["", "localhost", "localhost:3000", "127.0.0.1:3000", "192.168.1.10", "10.0.0.5", "0.0.0.0:3000", "dev.local"])
  assert(detectEnvironment(h) === "development", `host ${JSON.stringify(h)} should be development`);

assert(MAINTENANCE_KEY.production !== MAINTENANCE_KEY.development, "keys must be distinct");

// Simulate the proxy decision: host -> env -> that env's key only.
function blocked(host: string, settings: Record<Environment, boolean>): boolean {
  return settings[detectEnvironment(host)] === true;
}

const setUp = (p: boolean, d: boolean): Record<Environment, boolean> => ({ production: p, development: d });

// prod OFF + dev OFF
assert(!blocked("keebforge.in", setUp(false, false)), "prod offline when prod OFF");
assert(!blocked("localhost:3000", setUp(false, false)), "dev offline when dev OFF");

// prod ON + dev OFF -> only production
assert(blocked("keebforge.in", setUp(true, false)), "prod blocked when prod ON");
assert(!blocked("localhost:3000", setUp(true, false)), "dev NOT affected by prod ON");

// prod OFF + dev ON -> only development
assert(!blocked("keebforge.in", setUp(false, true)), "prod NOT affected by dev ON");
assert(blocked("localhost:3000", setUp(false, true)), "dev blocked when dev ON");

// prod ON + dev ON -> both
assert(blocked("keebforge.in", setUp(true, true)), "prod blocked when both ON");
assert(blocked("localhost:3000", setUp(true, true)), "dev blocked when both ON");

console.log("maintenance isolation (4 cases) OK");
