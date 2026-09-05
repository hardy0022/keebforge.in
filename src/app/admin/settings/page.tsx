import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { getSiteSetting } from "@/lib/data";
import { MAINTENANCE_KEY } from "@/lib/environment";
import { PICKUP_SETTING_KEY } from "@/lib/delhivery";
import { MaintenanceModeCard } from "./MaintenanceModeCard";
import { PickupLocationCard } from "./PickupLocationCard";

export const metadata: Metadata = {
  title: "Settings | KeebForge Admin",
  robots: { index: false, follow: false },
};

export default async function AdminSettingsPage() {
  await requirePermission("setting", "view");

  const [productionEnabled, developmentEnabled, pickupSetting] = await Promise.all([
    (await getSiteSetting(MAINTENANCE_KEY.production)) === true,
    (await getSiteSetting(MAINTENANCE_KEY.development)) === true,
    getSiteSetting(PICKUP_SETTING_KEY),
  ]);

  const pickupInitial =
    pickupSetting && typeof pickupSetting === "object" && !Array.isArray(pickupSetting)
      ? (pickupSetting as Record<string, string>)
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 960 }}>
      <div>
        <span className="sec-num">{"// System Settings"}</span>
      </div>

      <div>
        <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "1.05rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>
          Catalog
        </h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Link href="/admin/settings/brands" className="admin-card" style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}>
            <span style={{ fontSize: "1.4rem" }}>🏷️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "0.95rem", color: "var(--t1)" }}>Brands</div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>Manage brand catalogue</div>
            </div>
            <span className="btn-admin sm">Open →</span>
          </Link>
          <Link href="/admin/settings/categories" className="admin-card" style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none" }}>
            <span style={{ fontSize: "1.4rem" }}>🗂️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--ff-display)", fontWeight: 700, fontSize: "0.95rem", color: "var(--t1)" }}>Categories</div>
              <div className="muted" style={{ fontSize: "0.8rem" }}>Manage product categories</div>
            </div>
            <span className="btn-admin sm">Open →</span>
          </Link>
        </div>
      </div>

      <div>
        <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "1.05rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>
          Maintenance Mode
        </h2>
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

      <div>
        <h2 style={{ fontFamily: "var(--ff-display)", fontSize: "1.05rem", fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>
          Shipping
        </h2>
      </div>

      <PickupLocationCard initial={pickupInitial} />
    </div>
  );
}