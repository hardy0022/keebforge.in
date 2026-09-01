export type Environment = "production" | "development";

export const PRODUCTION_HOST = "keebforge.in";
export const DEVELOPMENT_HOST = "localhost:3000";

export const MAINTENANCE_KEY: Record<Environment, string> = {
  production: "maintenanceMode.production",
  development: "maintenanceMode.development",
};

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
