"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export type ConfigService = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  device: "KEYBOARD" | "MOUSE" | "OTHER";
  unit: "PER_SWITCH" | "PER_STABILIZER" | "FLAT" | "QUOTE";
  price: number | null; // paise
  priceMin: number | null;
  priceMax: number | null;
  priceLabel: string | null;
  combo: boolean;
  popular: boolean;
  highlight: boolean;
  replaces: string[] | null;
  exclusiveWith: string[] | null;
  groupName: string;
  groupSlug: string;
};

type Group = { name: string; slug: string; services: ConfigService[] };

type Props = { groups: Group[] };

type QtyKey = "sw" | "stab" | "msw";

const CHECK_SVG = (
  <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
    <path d="M1 4L3.5 6.5L9 1" stroke="#000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const LAYOUT_MAP: Record<string, { sw: number; stab: number }> = {
  "60%": { sw: 61, stab: 4 },
  "65%": { sw: 68, stab: 4 },
  "75%": { sw: 82, stab: 5 },
  TKL: { sw: 87, stab: 5 },
  "96%": { sw: 96, stab: 6 },
  "100%": { sw: 104, stab: 6 },
  "Full Size": { sw: 108, stab: 7 },
};

function amt(paise: number) {
  return (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function priceLabel(svc: ConfigService): { text: string; quote: boolean } {
  const isQuote = svc.unit === "QUOTE" || (!svc.price && svc.priceMin == null);
  if (isQuote) return { text: "Quote", quote: true };
  if (svc.priceMin != null && svc.priceMax != null) {
    return { text: `₹${amt(svc.priceMin)}–${amt(svc.priceMax)}`, quote: false };
  }
  let suffix = "";
  if (svc.priceLabel) {
    suffix = svc.priceLabel.replace("₹", "").replace(String(amt(svc.price ?? 0)), "");
  }
  if (!suffix) {
    suffix = svc.unit === "PER_STABILIZER" ? "/EA" : svc.unit === "FLAT" ? "" : "/SW";
  }
  return { text: `+₹${amt(svc.price ?? 0)}${suffix}`, quote: false };
}

function QtyControl({
  label,
  id,
  value,
  onChange,
  onSetValue,
}: {
  label: string;
  id: QtyKey;
  value: number;
  onChange: (key: QtyKey, delta: number) => void;
  onSetValue: (key: QtyKey, value: number) => void;
}) {
  return (
    <div className="qty-row">
      <span className="qty-label">{label}</span>
      <div className="qty-ctrl">
        <button className="qty-btn" type="button" onClick={() => onChange(id, -1)} aria-label={`Decrease ${label.toLowerCase()}`}>−</button>
        <input className="qty-val" type="number" value={value} min={1} max={999} onChange={(e) => onSetValue(id, Math.max(1, parseInt(e.target.value || "1", 10)))} />
        <button className="qty-btn" type="button" onClick={() => onChange(id, 1)} aria-label={`Increase ${label.toLowerCase()}`}>+</button>
      </div>
    </div>
  );
}

function DevicePanel({
  dev,
  active,
  groups,
  selected,
  onToggle,
}: {
  dev: "KEYBOARD" | "MOUSE";
  active: boolean;
  groups: Group[];
  selected: Set<string>;
  onToggle: (svc: ConfigService) => void;
}) {
  return (
    <div className="device-panel" data-device={dev.toLowerCase()} style={active ? { display: "block" } : undefined}>
      {groups
        .filter((g) => g.services[0]?.device === dev)
        .map((g) => (
          <div className="est-group" key={g.slug}>
            <div className="est-group-label">{g.name}</div>
            <div className="service-grid">
              {g.services.map((svc) => {
                const checked = selected.has(svc.id);
                const { text, quote } = priceLabel(svc);
                return (
                  <label key={svc.id} className={`service-row${checked ? " selected" : ""}${svc.highlight ? " highlight-row" : ""}`}>
                    <input type="checkbox" checked={checked} onChange={() => onToggle(svc)} />
                    <div className="chk-box">{CHECK_SVG}</div>
                    <div className="svc-info">
                      <div className="svc-name">{svc.name}</div>
                      <div className="svc-desc">
                        {svc.description}
                        {svc.popular && (
                          <>
                            <br />
                            <span className="combo-badge">{svc.combo ? "★ Recommended Combo" : "★ Recommended Process"}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className={`svc-price${quote ? " svc-price-quote" : ""}`}>{text}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
    </div>
  );
}

export function ServiceConfigurator({ groups }: Props) {
  const [device, setDevice] = useState<"KEYBOARD" | "MOUSE">("KEYBOARD");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<QtyKey, number>>({ sw: 65, stab: 4, msw: 2 });
  const [layout, setLayout] = useState<string | null>(null);
  const [keycaps, setKeycaps] = useState<string | null>(null);

  const byId = useMemo(() => {
    const m = new Map<string, ConfigService>();
    groups.forEach((g) => g.services.forEach((s) => m.set(s.id, s)));
    return m;
  }, [groups]);

  const counts = useMemo(() => {
    const c = { KEYBOARD: 0, MOUSE: 0 };
    selected.forEach((id) => {
      const s = byId.get(id);
      if (s && (s.device === "KEYBOARD" || s.device === "MOUSE")) c[s.device]++;
    });
    return c;
  }, [selected, byId]);

  const qtyFor = (svc: ConfigService) => {
    if (svc.unit === "PER_STABILIZER") return qty.stab;
    if (svc.unit === "PER_SWITCH") return svc.groupSlug === "mouse-switch-services" ? qty.msw : qty.sw;
    return 1;
  };

  const summary = useMemo(() => {
    type Line = { id: string; name: string; meta: string | null; amount: number | null; priceText: string; quote: boolean };
    let total = 0;
    const lines: Line[] = [];
    const devs = new Set<string>();
    selected.forEach((id) => {
      const svc = byId.get(id);
      if (!svc) return;
      devs.add(svc.device);
      const { text } = priceLabel(svc);
      if (svc.unit === "QUOTE" || (!svc.price && svc.priceMin == null)) {
        lines.push({ id, name: svc.name, meta: null, amount: null, priceText: "Quote", quote: true });
        return;
      }
      if (svc.priceMin != null && svc.priceMax != null) {
        lines.push({ id, name: svc.name, meta: null, amount: null, priceText: text, quote: true });
        return;
      }
      const n = qtyFor(svc);
      const unit = svc.unit === "PER_STABILIZER" ? "stabilizer" : svc.unit === "PER_SWITCH" ? "switch" : "";
      const sub = (svc.price ?? 0) * n;
      total += sub;
      lines.push({
        id,
        name: svc.name,
        meta: unit ? `${n} × ${unit}${n > 1 ? "s" : ""}` : null,
        amount: sub,
        priceText: "",
        quote: false,
      });
    });
    return { total, lines, count: lines.length, devs: [...devs] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, qty, byId]);

  const toggle = (svc: ConfigService) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(svc.id)) {
        next.delete(svc.id);
        return next;
      }
      next.add(svc.id);
      const drop = new Set<string>(svc.replaces ?? []);
      (svc.exclusiveWith ?? []).forEach((s) => drop.add(s));
      [...next].forEach((id) => {
        const s = byId.get(id);
        if (!s) return;
        if (drop.has(s.slug)) next.delete(id);
        if (s.replaces?.includes(svc.slug)) next.delete(id);
      });
      return next;
    });
  };

  const adjustQty = (key: QtyKey, delta: number) => setQty((q) => ({ ...q, [key]: Math.max(1, q[key] + delta) }));
  const setQtyVal = (key: QtyKey, value: number) => setQty((q) => ({ ...q, [key]: value }));

  const selectLayout = (v: string) => {
    setLayout(v);
    const m = LAYOUT_MAP[v];
    if (m) setQty((q) => ({ ...q, sw: m.sw, stab: m.stab }));
  };

  return (
    <div className="order-wrap">
      <div className="main-config-stream">
        <div className="panel">
          <p className="panel-tag">Step 01</p>
          <h2 className="panel-title">Device Details</h2>
          <div className="device-tabs" role="tablist">
            <button type="button" className={`device-tab${device === "KEYBOARD" ? " active" : ""}`} onClick={() => setDevice("KEYBOARD")} role="tab" aria-selected={device === "KEYBOARD"}>
              ⌨️ Keyboard {counts.KEYBOARD > 0 && <span className="tab-count">{counts.KEYBOARD}</span>}
            </button>
            <button type="button" className={`device-tab${device === "MOUSE" ? " active" : ""}`} onClick={() => setDevice("MOUSE")} role="tab" aria-selected={device === "MOUSE"}>
              🖱️ Mouse {counts.MOUSE > 0 && <span className="tab-count">{counts.MOUSE}</span>}
            </button>
          </div>

          <div className="device-panel" data-device="keyboard" style={device === "KEYBOARD" ? { display: "block" } : undefined}>
            <div className="field-stack">
              <div className="field-inline">
                <label>Brand</label>
                <input type="text" placeholder="e.g. Keychron, Mode, Akko…" />
              </div>
              <div className="field-inline">
                <label>Keyboard Model / PCB Name</label>
                <input type="text" placeholder="e.g. Neo65, Keychron Q1, Mode Envoy…" />
              </div>
              <div className="field-inline">
                <label>Keyboard Layout</label>
                <div className="pill-radio-group">
                  {["60%", "65%", "75%", "TKL", "96%", "100%", "Full Size", "Custom"].map((l) => (
                    <label key={l} className={`pill-radio${layout === l ? " selected" : ""}`}>
                      <input type="radio" name="layout" checked={layout === l} onChange={() => selectLayout(l)} />
                      <span>{l}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field-inline">
                <label>Component Quantities</label>
                <div className="qty-stack-row">
                  <QtyControl label="Switches" id="sw" value={qty.sw} onChange={adjustQty} onSetValue={setQtyVal} />
                  <QtyControl label="Stabilizers" id="stab" value={qty.stab} onChange={adjustQty} onSetValue={setQtyVal} />
                </div>
              </div>
              <div className="field-inline">
                <label>Switch Model</label>
                <input type="text" placeholder="e.g. Gateron Cream Soda, HMX Xinhai…" />
                <div className="inline-note">We&apos;ll check switch compatibility with your build before starting work.</div>
              </div>
              <div className="field-inline">
                <label>Are Keycaps Included?</label>
                <div className="pill-radio-group">
                  {["Keycaps Included", "No Keycaps"].map((k) => (
                    <label key={k} className={`pill-radio${keycaps === k ? " selected" : ""}`}>
                      <input type="radio" name="keycaps" checked={keycaps === k} onChange={() => setKeycaps(k)} />
                      <span>{k === "Keycaps Included" ? "Included" : "Not Included"}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="device-panel" data-device="mouse" style={device === "MOUSE" ? { display: "block" } : undefined}>
            <div className="field-stack">
              <div className="field-inline">
                <label>Brand</label>
                <input type="text" placeholder="e.g. Logitech, Razer, VAXEE…" />
              </div>
              <div className="field-inline">
                <label>Mouse Model</label>
                <input type="text" placeholder="e.g. G Pro X Superlight 2, Razer Viper V3 Pro…" />
              </div>
              <div className="field-inline">
                <label>Component Quantities</label>
                <div className="qty-stack-row">
                  <QtyControl label="Number of Switches" id="msw" value={qty.msw} onChange={adjustQty} onSetValue={setQtyVal} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="panel-tag">Step 02</p>
          <h2 className="panel-title">Available {device === "KEYBOARD" ? "Keyboard" : "Mouse"} Services</h2>
          <DevicePanel dev="KEYBOARD" active={device === "KEYBOARD"} groups={groups} selected={selected} onToggle={toggle} />
          <DevicePanel dev="MOUSE" active={device === "MOUSE"} groups={groups} selected={selected} onToggle={toggle} />
        </div>
      </div>

      <div className="sticky-summary-hub">
        <div className="panel">
          <p className="panel-tag">Summary</p>
          <h2 className="panel-title">Order Estimate</h2>

          <div className="summary-head">
            {summary.count > 0 ? (
              <>
                <span className="summary-count-chip">
                  {summary.count} {summary.count === 1 ? "service" : "services"}
                </span>
                <span className="summary-devs">
                  {summary.devs.map((d) => (d === "KEYBOARD" ? "⌨️ Keyboard" : "🖱️ Mouse")).join("  +  ")}
                </span>
              </>
            ) : (
              <span className="summary-devs">No services selected yet</span>
            )}
          </div>

          <div className={`summary-box${summary.lines.length === 0 ? " empty" : ""}`}>
            {summary.lines.length === 0 ? (
              <div className="summary-empty">
                <span className="summary-empty-ico">◇</span>
                <span>Pick services in Step 02 to build your estimate.</span>
              </div>
            ) : (
              <div className="summary-list">
                {summary.lines.map((l, i) => (
                  <div key={l.id} className={`summary-line${i > 0 ? " lined" : ""}`}>
                    <div className="summary-line-info">
                      <div className="summary-line-name">{l.name}</div>
                      {l.meta && <div className="summary-line-meta">{l.meta}</div>}
                    </div>
                    <div className="summary-line-amt">
                      {l.quote ? <span className="quote-chip">{l.priceText}</span> : `₹${amt(l.amount!)}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="total-container">
            <div className="total-row">
              <span className="total-label">Estimated Subtotal</span>
              <span className="total-amount">₹{amt(summary.total)}</span>
            </div>
            <div className="total-note">* Quote-based services are confirmed after we review your order.</div>
            <Link href="/checkout" className="btn-prime kf-checkout-btn">
              Proceed to Checkout
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 13L13 3M13 3H6M13 3V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}