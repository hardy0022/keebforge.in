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
