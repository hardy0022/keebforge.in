import type { Metadata } from "next";
import { headers } from "next/headers";
import { requirePermission } from "@/lib/auth/admin";
import { getSiteSetting } from "@/lib/data";
import { MaintenanceModeCard } from "./MaintenanceModeCard";

export const metadata: Metadata = { title: "Settings | KeebForge Admin", robots: { index: false, follow: false } };

function detectEnvironment(host: string): { isProduction: boolean; siteName: string } {
  const isProduction = !(
    host === "" ||
    host.includes("localhost") ||
    host.startsWith("127.") ||
    host.startsWith("192.168.") ||
    host.startsWith("10.") ||
    host.startsWith("0.0.0.0") ||
    host.endsWith(".local")
  );
  return { isProduction, siteName: isProduction ? "keebforge.in" : host || "localhost:3000" };
}

export default async function AdminSettingsPage() {
  await requirePermission("setting", "view");

  const host = (await headers()).get("host") ?? "";
  const env = detectEnvironment(host);
  const maintenanceMode = (await getSiteSetting("maintenanceMode")) === true;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
      <div>
        <div className="admin-label" style={{ marginBottom: 6 }}>System</div>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
          Settings
        </h1>
        <p className="muted" style={{ marginTop: 2 }}>
          Global website and application configuration.
        </p>
      </div>

      <div className={`env-indicator ${env.isProduction ? "env-prod" : "env-dev"}`}>
        <span className="env-dot" />
        <div>
          <div className="env-name">{env.isProduction ? "PRODUCTION" : "DEVELOPMENT"}</div>
          <div className="env-host">{env.siteName}</div>
        </div>
      </div>

      <MaintenanceModeCard enabled={maintenanceMode} isProduction={env.isProduction} siteName={env.siteName} />
    </div>
  );
}
