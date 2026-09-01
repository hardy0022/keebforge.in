import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { getSiteSetting } from "@/lib/data";
import { MAINTENANCE_KEY } from "@/lib/environment";
import { MaintenanceModeCard } from "./MaintenanceModeCard";

export const metadata: Metadata = { title: "Settings | KeebForge Admin", robots: { index: false, follow: false } };

export default async function AdminSettingsPage() {
  await requirePermission("setting", "view");

  const [productionEnabled, developmentEnabled] = await Promise.all([
    (await getSiteSetting(MAINTENANCE_KEY.production)) === true,
    (await getSiteSetting(MAINTENANCE_KEY.development)) === true,
  ]);

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

      <div>
        <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "1.05rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>
          Maintenance Mode
        </h2>
        <p className="muted" style={{ marginTop: -6, marginBottom: 16 }}>
          Control public access per environment. Production and local development are fully independent.
        </p>
      </div>

      <MaintenanceModeCard
        environment="production"
        name="KEEBFORGE.IN"
        url="https://keebforge.in"
        enabled={productionEnabled}
        prominent
        confirmationTitle="Enable production maintenance?"
        confirmationBody="Visitors to keebforge.in will temporarily be unable to access the website."
        confirmationNote="This will NOT affect localhost:3000."
      />

      <MaintenanceModeCard
        environment="development"
        name="LOCALHOST:3000"
        url="http://localhost:3000"
        enabled={developmentEnabled}
        confirmationTitle="Enable development maintenance?"
        confirmationBody="localhost:3000 will temporarily show the maintenance page."
        confirmationNote="This will NOT affect keebforge.in."
      />
    </div>
  );
}
