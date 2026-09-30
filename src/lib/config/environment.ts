export type Environment = "production" | "development";

export const MAINTENANCE_KEY: Record<Environment, string> = {
  production: "maintenanceMode.production",
  development: "maintenanceMode.development",
};

/** Site-wide "still under development" notice. One key, every environment. */
export const DEVELOPMENT_NOTICE_KEY = "developmentNotice.enabled";

export function detectEnvironment(host: string): Environment {
  const isDevelopment =
    host === "" ||
    host.includes("localhost") ||
    host.startsWith("127.") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.startsWith("0.0.0.0") ||
    host.endsWith(".local");
  return isDevelopment ? "development" : "production";
}

/**
 * Admin panel enablement, per environment (same shape as MAINTENANCE_KEY).
 *
 * Defaults to ENABLED in both environments so existing order/shipment/review
 * workflows keep working. Set the production flag to false to hide /admin from
 * the public host while localhost keeps working:
 *
 *   ADMIN_PANEL_PRODUCTION_ENABLED=false   # https://keebforge.in/admin -> 404
 *   ADMIN_PANEL_DEVELOPMENT_ENABLED=true   # http://localhost:3000/admin -> works
 *
 * ADMIN_PANEL_ENABLED is a master switch applied to both when set.
 *
 * This is only a first gate — it is a server-side routing decision, NOT an
 * authorization boundary. requireAdminContext() in the admin layout remains the
 * real boundary and always runs.
 */
const FALSEY = new Set(["false", "0", "off", "no"]);

function enabled(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === "") return fallback;
  return !FALSEY.has(raw.trim().toLowerCase());
}

/**
 * Exact loopback check for the admin gate.
 *
 * detectEnvironment() calls any host *containing* "localhost" development, which
 * is fine for the maintenance notice but unsafe as access control: a request
 * carrying `Host: localhost.evil.com` would otherwise select the development
 * policy on a public host. The gate matches the hostname exactly and treats an
 * unknown or missing host as production, so it fails closed. The port is
 * stripped first, so :3000 is not a boundary.
 */
export function isLoopbackHost(host: string): boolean {
  let h = host.trim().toLowerCase();
  if (h.startsWith("[")) {
    // Bracketed IPv6, with or without a port: "[::1]" / "[::1]:3000".
    h = h.slice(1, h.indexOf("]") === -1 ? h.length : h.indexOf("]"));
  } else if (h.indexOf(":") === h.lastIndexOf(":")) {
    // Exactly one colon: a hostname or IPv4 with a port. "::1" has two, so it
    // is left alone.
    h = h.replace(/:\d+$/, "");
  }
  return h === "localhost" || h === "::1" || /^127\.\d+\.\d+\.\d+$/.test(h);
}

/**
 * Whether /admin should be served for this request's Host header.
 *
 * ADMIN_PANEL_ENABLED is the master switch; the per-environment flag wins when
 * set, and an unset/blank one falls back to the master. Both default to enabled
 * so the existing admin keeps working until a deployment opts out.
 */
export function adminPanelEnabled(host: string): boolean {
  const master = process.env.ADMIN_PANEL_ENABLED;
  const fallback = enabled(master, true);
  const perEnv = isLoopbackHost(host)
    ? process.env.ADMIN_PANEL_DEVELOPMENT_ENABLED
    : process.env.ADMIN_PANEL_PRODUCTION_ENABLED;
  return enabled(perEnv, fallback);
}
