"use client";

import { ServicePriceInline } from "./ServicePriceInline";

export type ModsService = {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  price: number | null;
  priceMin: number | null;
  priceMax: number | null;
  priceLabel: string | null;
};

export type ModsGroup = {
  id: string;
  name: string;
  desc: string | null;
  services: ModsService[];
};

export type ModsDevice = {
  device: "KEYBOARD" | "MOUSE";
  title: string;
  subtitle: string;
  groups: ModsGroup[];
};

export function ModsManager({
  devices,
  totals,
}: {
  devices: ModsDevice[];
  totals: { keyboard: number; mouse: number; services: number };
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* Page header */}
      <div>
        <h1 style={{ fontFamily: "var(--ff-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
          Mods
        </h1>
        <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
          Manage keyboard and mouse modification services and their pricing.
        </p>
      </div>

      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <div className="admin-stat lime"><b>{totals.keyboard}</b><span>Keyboard Mods</span></div>
        <div className="admin-stat purple"><b>{totals.mouse}</b><span>Mouse Mods</span></div>
        <div className="admin-stat"><b>{totals.services}</b><span>Active Services</span></div>
      </div>

      {devices.map((d) => (
        <section key={d.device} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Device heading */}
          <div className="mods-device">
            <h2 style={{ fontFamily: "var(--ff-display)", fontSize: 18, fontWeight: 700, letterSpacing: "-0.01em", margin: 0 }}>
              {d.title}
            </h2>
            <span className="muted" style={{ fontSize: "0.82rem" }}>{d.subtitle}</span>
          </div>

          {d.groups.map((g) => (
            <div key={g.id} style={{ display: "flex", flexDirection: "column" }}>
              <h3 className="mods-cat-label" style={{ marginBottom: 10 }}>{g.name}</h3>
              {g.desc && <p className="muted" style={{ margin: "-6px 0 10px", fontSize: "0.78rem" }}>{g.desc}</p>}
              <div className="mods-grid">
                {g.services.map((svc) => (
                  <div key={svc.id} className="mods-service-card">
                    <div className="mods-service-info">
                      <div style={{ fontWeight: 600, fontSize: "0.9rem", lineHeight: 1.25 }}>{svc.name}</div>
                      {svc.description && (
                        <div className="muted" style={{ fontSize: "0.74rem", marginTop: 2, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis" }}>
                          {svc.description}
                        </div>
                      )}
                    </div>
                    <ServicePriceInline
                      svc={{
                        id: svc.id,
                        unit: svc.unit,
                        price: svc.price,
                        priceMin: svc.priceMin,
                        priceMax: svc.priceMax,
                        priceLabel: svc.priceLabel,
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
