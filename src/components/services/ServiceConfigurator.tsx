"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  calculateServiceOrder,
  type ServiceConfig,
  type ServiceOrderConfigInput,
} from "@/lib/services/pricing";
import { PACKAGE_LIMITS } from "@/lib/package-limits";
import { deriveLegs } from "@/lib/shipping-estimate";
import { INDIAN_STATES } from "@/lib/indian-states";
import { AddressPicker, type SavedAddressOption } from "@/components/services/AddressPicker";

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

/** Shape persisted to sessionStorage for the /checkout hand-off. */
export type StoredServiceCheckout = ServiceOrderConfigInput & {
  services: ConfigService[];
  shipping?: ModsShippingInput;
  contact?: ModsContactInput;
};

/** Buyer contact captured at Step 05 and persisted with the cart config. */
export type ModsContactInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  alt: string;
};

export type ModsShippingMethod = "customer_shipping" | "pickup" | "undecided";

/** Delhivery delivery-speed modes offered in the UI (mirrors lib/shipping). */
export type ModsShipMode = "surface" | "express";

/** Shipping/pickup block captured by steps 03–04 and persisted with the cart config. */
export type ModsShippingInput = {
  method: ModsShippingMethod;
  mode: ModsShipMode;
  address: { street: string; landmark: string; city: string; state: string; pincode: string };
  package: { lengthCm: number; widthCm: number; heightCm: number; weightKg: number };
  quote: { pickupPaise: number | null; returnPaise: number | null; totalPaise: number | null };
  /** Display snapshot only — the server recalculates authoritative amounts on add-to-cart. */
  totals?: { serviceSubtotalPaise: number | null; estimatedTotalPaise: number | null };
};

type Props = {
  groups: Group[];
  /** Delivery speeds the storefront offers. */
  shippingModes?: ModsShipMode[];
  /** Pre-selected speed (from DELHIVERY_DEFAULT_MODE). */
  defaultShipMode?: ModsShipMode;
};

type QtyKey = "sw" | "stab" | "msw";
type DeviceKey = "KEYBOARD" | "MOUSE";
const DEVICES: DeviceKey[] = ["KEYBOARD", "MOUSE"];

export const SERVICE_CHECKOUT_KEY = "serviceCheckoutConfig";
/** Preserved across checkout round-trips so the user doesn't lose work
 *  when clicking "Back to Configuration". */
export const MODS_DRAFT_KEY = "modsConfigDraft";

const LAYOUT_MAP: Record<string, { sw: number; stab: number }> = {
  "60%": { sw: 61, stab: 4 },
  "65%": { sw: 68, stab: 4 },
  "75%": { sw: 82, stab: 5 },
  TKL: { sw: 87, stab: 5 },
  "96%": { sw: 96, stab: 6 },
  "100%": { sw: 104, stab: 6 },
  "Full Size": { sw: 108, stab: 7 },
};

const DEVICE_ICON: Record<DeviceKey, string> = { KEYBOARD: "⌨️", MOUSE: "🖱️" };
const DEVICE_LABEL: Record<DeviceKey, string> = { KEYBOARD: "Keyboard", MOUSE: "Mouse" };

/* Static-fidelity presentation data (mirrors TEMP/index.html) */
const SERVICE_ICON: Record<string, string> = {
  "krytox-205g0-lubing": "✨",
  "switch-stem-tuning": "🟡",
  "durock-films": "🔵",
  "tx-films": "⚪",
  "spring-swap-oil": "🌀",
  "complete-mod-combo": "🔥",
  "full-stabilizer-service": "🛠️",
  "wire-balancing-only": "⚖️",
  "restore-old-stabilizers": "♻️",
  "solder-switches": "🔧",
  "desolder-switches": "🔩",
  "keyboard-build-60-65": "⌨️",
  "keyboard-build-tkl": "🖥️",
  "millmax-socket-install": "🔌",
  "hotswap-socket-install": "🔁",
  "split-keyboard-build": "🧩",
  "pcb-troubleshooting-repair": "🔬",
  "custom-pcb-design-layout": "📐",
  "pcb-fabrication-support": "🏭",
  "full-custom-keyboard-build": "🎛️",
  "firmware-upload-testing": "💾",
  "general-electronics-repair": "🩺",
  "switch-swap": "🖱️",
  "middle-side-switch-swap": "🔘",
  "tape-mod": "🧵",
  "skate-feet-replacement": "🛼",
  "encoder-replacement": "🎡",
  "mouse-diagnostics-repair": "🩺",
};

export const GROUP_DESC: Record<string, string> = {
  "switch-services":
    "Individual switch modifications with precision application — every switch treated with care.",
  "mouse-switch-services":
    "Fix double-clicking, mushy clicks, and worn mouse switches with fresh, quality switches.",
  "stabilizer-services":
    "Eliminate rattle and achieve smooth, consistent stabilizers on every key.",
  "mouse-mods-repairs":
    "Tape mods, skate swaps, and repairs to keep your mouse feeling and sounding right.",
  "build-soldering":
    "Professional soldering, desoldering, and complete keyboard assembly.",
  "custom-pcb-design":
    "End-to-end design, fabrication support, and firmware — from concept to working board.",
};

type GridKind = "switch" | "stab" | "wide" | "std";const GROUP_GRID: Record<string, GridKind> = {
  "switch-services": "switch",
  "stabilizer-services": "stab",
  "build-soldering": "wide",
  "custom-pcb-design": "std",
  "mouse-switch-services": "wide",
  "mouse-mods-repairs": "wide",
};

function amt(paise: number) {
  return (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

type PriceParts = { quote: true } | { quote: false; amount: string; unit: string | null; range: boolean };

function priceParts(svc: ConfigService): PriceParts {
  if (svc.unit === "QUOTE" || (!svc.price && svc.priceMin == null)) return { quote: true };
  if (svc.priceMin != null && svc.priceMax != null) {
    return { quote: false, amount: `₹${amt(svc.priceMin)}–${amt(svc.priceMax)}`, unit: null, range: true };
  }
  const unit =
    svc.unit === "PER_SWITCH" ? "per switch" : svc.unit === "PER_STABILIZER" ? "each" : null;
  return { quote: false, amount: `₹${amt(svc.price ?? 0)}`, unit, range: false };
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

function cardToggleProps(
  svc: ConfigService,
  checked: boolean,
  onToggle: (svc: ConfigService) => void
) {
  return {
    role: "checkbox" as const,
    "aria-checked": checked,
    tabIndex: 0,
    onClick: (e: ReactMouseEvent) => {
      // Ignore clicks that originate from the card's own button.
      if ((e.target as HTMLElement).closest("button")) return;
      onToggle(svc);
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      // Only handle keys when the card itself is focused, not inner buttons.
      if (e.target !== e.currentTarget) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        onToggle(svc);
      }
    },
  };
}

function ServiceCard({
  svc,
  checked,
  onToggle,
  className,
}: {
  svc: ConfigService;
  checked: boolean;
  onToggle: (svc: ConfigService) => void;
  className?: string;
}) {
  const p = priceParts(svc);
  const cls = ["card", "svc-pick"];
  if (className) cls.push(className);
  if (checked) cls.push("selected");
  if (p.quote) cls.push("card-q");
  return (
    <div {...cardToggleProps(svc, checked, onToggle)} className={cls.join(" ")}>
      <div className="ch">
        <span className="ci">{SERVICE_ICON[svc.slug] ?? "⚙️"}</span>
        {p.quote ? (
          <span className="qbadge">Quote Based</span>
        ) : (
          <div className="cp">
            <em className={`ca${p.range ? " ca-range" : ""}`}>{p.amount}</em>
            {p.unit && <span className="cu">{p.unit}</span>}
          </div>
        )}
      </div>
      <h3 className="ct">{svc.name}</h3>
      <p className="cd">{svc.description}</p>
      <button
        type="button"
        className={`card-btn${checked ? " is-on" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(svc);
        }}
      >
        {checked ? "Selected ✓" : "Select"}
      </button>
    </div>
  );
}

function ComboCard({
  svc,
  checked,
  onToggle,
  className,
}: {
  svc: ConfigService;
  checked: boolean;
  onToggle: (svc: ConfigService) => void;
  className?: string;
}) {
  const p = priceParts(svc);
  return (
    <article
      {...cardToggleProps(svc, checked, onToggle)}
      className={`card card-feat svc-pick${className ? ` ${className}` : ""}${checked ? " selected" : ""}`}
    >
      <div className="feat-badge">★ Most Popular</div>
      <div className="ch">
        <span className="ci">{SERVICE_ICON[svc.slug] ?? "🔥"}</span>
        {!p.quote && (
          <div className="cp">
            <em className={`ca ca-lg${p.range ? " ca-range" : ""}`}>{p.amount}</em>
            {p.unit && <span className="cu">{p.unit}</span>}
          </div>
        )}
      </div>
      <h3 className="ct">{svc.name}</h3>
      <p className="cd">{svc.description}</p>
      <ul className="feat-list">
        <li><span className="chk">✓</span> Krytox 205g0 Lubing</li>
      </ul>
      <button
        type="button"
        className={`btn-feat${checked ? " is-selected" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(svc);
        }}
      >
        {checked ? "Added to Order ✓" : "Get This Deal"}
      </button>
    </article>
  );
}

function GroupHead({ name, slug }: { name: string; slug: string }) {
  return (
    <header className="svc-group-head" id={`group-${slug}`}>
      <h3 className="svc-group-title">{name}</h3>
      {GROUP_DESC[slug] && <p className="svc-group-desc">{GROUP_DESC[slug]}</p>}
    </header>
  );
}

function ServiceGroup({
  group,
  selected,
  onToggle,
}: {
  group: Group;
  selected: Set<string>;
  onToggle: (svc: ConfigService) => void;
}) {
  const kind = GROUP_GRID[group.slug] ?? "wide";
  const combo = group.services.find((s) => s.combo);

  if (kind === "switch" && combo) {
    /** Asymmetric switch grid (mirrors TEMP/index.html): lead card wide top-left,
     *  combo tall on the right column, remaining singles filling the slots below.
     *  Placement adapts to whichever services are currently enabled. */
    const byslug = new Map(group.services.map((s) => [s.slug, s]));
    const lead = byslug.get("krytox-205g0-lubing");
    const rest = group.services.filter((s) => !s.combo && s !== lead);
    const slots = ["sw-slot-a", "sw-slot-b", "sw-slot-c", "sw-slot-d"];
    const solo = !!lead && rest.length === 1;
    const comboExtra = solo ? " sw-combo-2" : rest.length === 0 ? " sw-combo-1" : "";

    return (
      <>
        <GroupHead name={group.name} slug={group.slug} />
        <div className="sw-grid">
          {lead && (
            <ServiceCard
              key={lead.id}
              svc={lead}
              checked={selected.has(lead.id)}
              onToggle={onToggle}
              className="sw-krytox"
            />
          )}
          <ComboCard
            key={combo.id}
            svc={combo}
            checked={selected.has(combo.id)}
            onToggle={onToggle}
            className={`sw-combo${comboExtra}`}
          />
          {rest.map((svc, i) => (
            <ServiceCard
              key={svc.id}
              svc={svc}
              checked={selected.has(svc.id)}
              onToggle={onToggle}
              className={solo ? "sw-solo" : slots[i]}
            />
          ))}
        </div>
      </>
    );
  }

  if (kind === "stab") {
    /** Asymmetric stabilizer grid: Restore wide top-left, Wire Balancing wide
     *  bottom-left, Full Service tall on the right column. */
    const byslug = new Map(group.services.map((s) => [s.slug, s]));
    const restore = byslug.get("restore-old-stabilizers");
    const wire = byslug.get("wire-balancing-only");
    const full = byslug.get("full-stabilizer-service");

    if (restore && wire && full && group.services.length === 3) {
      return (
        <>
          <GroupHead name={group.name} slug={group.slug} />
          <div className="stb-grid">
            <ServiceCard key={restore.id} svc={restore} checked={selected.has(restore.id)} onToggle={onToggle} className="stb-restore" />
            <ServiceCard key={wire.id} svc={wire} checked={selected.has(wire.id)} onToggle={onToggle} className="stb-wire" />
            <ServiceCard key={full.id} svc={full} checked={selected.has(full.id)} onToggle={onToggle} className="stb-full" />
          </div>
        </>
      );
    }
    // Otherwise fall through to the generic grid below.
  }

  const gridCls = kind === "stab" ? "cards-stab" : kind === "std" ? "cards" : "cards-wide";
  return (
    <>
      <GroupHead name={group.name} slug={group.slug} />
      <div className={gridCls}>
        {group.services.map((svc) => (
          <ServiceCard key={svc.id} svc={svc} checked={selected.has(svc.id)} onToggle={onToggle} />
        ))}
      </div>
    </>
  );
}

function DevicePanel({
  dev,
  active,
  groups,
  selected,
  onToggle,
}: {
  dev: DeviceKey;
  active: boolean;
  groups: Group[];
  selected: Set<string>;
  onToggle: (svc: ConfigService) => void;
}) {
  const devGroups = groups.filter((g) => g.services[0]?.device === dev);
  return (
    <div className="device-panel" data-device={dev.toLowerCase()} style={active ? { display: "block" } : undefined}>
      <div className="config-groups">
        {devGroups.map((g) => (
          <ServiceGroup key={g.slug} group={g} selected={selected} onToggle={onToggle} />
        ))}
      </div>
    </div>
  );
}

/** Read the stashed configuration (used by "Edit Configuration" round-trips).
 *  Checks the checkout session first, then falls back to the draft config. */
function loadStoredCheckout(): StoredServiceCheckout | null {
  // Active checkout session (from "Pay & Confirm")
  try {
    const raw = sessionStorage.getItem(SERVICE_CHECKOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredServiceCheckout;
      if (parsed && parsed.deviceType && Array.isArray(parsed.serviceIds)) return parsed;
    }
  } catch {
    /* malformed — ignore */
  }
  // Draft config (preserved when returning from checkout)
  try {
    const raw = sessionStorage.getItem(MODS_DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StoredServiceCheckout;
      if (parsed && parsed.deviceType && Array.isArray(parsed.serviceIds)) return parsed;
    }
  } catch {
    /* malformed — ignore */
  }
  return null;
}

function toServiceConfig(s: ConfigService): ServiceConfig {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    device: s.device,
    unit: s.unit,
    price: s.price,
    priceMin: s.priceMin,
    priceMax: s.priceMax,
    priceLabel: s.priceLabel,
    groupSlug: s.groupSlug,
  };
}

export function ServiceConfigurator({ groups, shippingModes, defaultShipMode }: Props) {
  const modes = shippingModes?.length ? shippingModes : (["express" as ModsShipMode]);
  const router = useRouter();
  const [device, setDevice] = useState<DeviceKey>("KEYBOARD");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qty, setQty] = useState<Record<QtyKey, number>>({ sw: 65, stab: 4, msw: 2 });
  const [layout, setLayout] = useState<string | null>(null);
  const [keycaps, setKeycaps] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<DeviceKey, { brand: string; model: string; switchModel: string }>>({
    KEYBOARD: { brand: "", model: "", switchModel: "" },
    MOUSE: { brand: "", model: "", switchModel: "" },
  });
  const restored = useRef(false);

  // ── Shipping / Pickup (Step 03) + Package Details (Step 04) ────────────────
  const [shipMethod, setShipMethod] = useState<ModsShippingMethod>("undecided");
  const [shipMode, setShipMode] = useState<ModsShipMode>(defaultShipMode ?? "express");
  const [contact, setContact] = useState<ModsContactInput>({ firstName: "", lastName: "", phone: "", email: "", alt: "" });
  const nameOk = contact.firstName.trim().length >= 1 && contact.lastName.trim().length >= 1;
  const phoneOk = /^\d{10}$/.test(contact.phone);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim());
  const contactValidation = [
    ...(!nameOk ? ["Please enter your full name."] : []),
    ...(!phoneOk ? ["Enter a valid WhatsApp / phone number."] : []),
    ...(!emailOk ? ["Enter a valid email address."] : []),
  ];
  const [addr, setAddr] = useState({ street: "", landmark: "", city: "", state: "", pincode: "" });
  // Saved addresses (logged-in customers only; empty for guests).
  const [savedAddresses, setSavedAddresses] = useState<SavedAddressOption[]>([]);
  /** Selected saved address; "" = manual entry, null = untouched (no prefill yet). */
  const [useAddressId, setUseAddressId] = useState<string | null>(null);

  const applySavedAddress = (a: SavedAddressOption) => {
    setUseAddressId(a.id);
    setAddr({ street: a.streetAddress, landmark: a.apartment || "", city: a.city, state: a.state, pincode: a.postalCode });
    const parts = (a.name || "").trim().split(/\s+/);
    setContact((c) => ({
      ...c,
      firstName: c.firstName || (parts[0] ?? ""),
      lastName: c.lastName || parts.slice(1).join(" "),
      email: a.email || c.email,
      phone: a.phone || c.phone,
    }));
  };
  const [pkg, setPkg] = useState({ L: "", W: "", H: "", g: "" });

  type QuoteState =
    | { s: "idle" }
    | { s: "calc" }
    | { s: "ok"; forwardPaise: number }
    | { s: "fail"; msg: string };
  const [quote, setQuote] = useState<QuoteState>({ s: "idle" });
  /** Input snapshot the current quote was computed for — any change invalidates it. */
  const [calcKey, setCalcKey] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);

  /**
   * Anything that affects the shipping quote — PIN, package, delivery speed,
   * or the selected services. The ship METHOD is deliberately excluded: both
   * methods price off the same forward quote, so legs re-derive instantly on
   * switch. A quote computed for a different key is stale and its amounts
   * are hidden until the customer recalculates.
   */
  const shipInputKeyOf = () =>
    JSON.stringify([shipMode, addr.pincode.trim(), pkg.L, pkg.W, pkg.H, pkg.g, activeServices.length]);
  const pinOk = /^[1-9]\d{5}$/.test(addr.pincode.trim());
  const pkgNums = { L: Number(pkg.L), W: Number(pkg.W), H: Number(pkg.H), g: Number(pkg.g) };
  const dimsOk =
    pkgNums.L > 0 && pkgNums.L <= PACKAGE_LIMITS.MAX_DIM_CM &&
    pkgNums.W > 0 && pkgNums.W <= PACKAGE_LIMITS.MAX_DIM_CM &&
    pkgNums.H > 0 && pkgNums.H <= PACKAGE_LIMITS.MAX_DIM_CM;
  const weightOk = pkgNums.g > 0 && pkgNums.g <= PACKAGE_LIMITS.MAX_WEIGHT_KG * 1000;
  const pkgOk = dimsOk && weightOk;
  const addrOk = addr.street.trim() !== "" && addr.city.trim() !== "" && addr.state.trim() !== "" && pinOk;
  const needsQuote = shipMethod !== "undecided";

  /**
   * Explicit user-triggered quote (no Delhivery calls on keystrokes). Any
   * later change to method/PIN/package/services marks the quote stale via
   * calcKey mismatch and hides its amounts until recalculated.
   */
  const calculateShippingNow = async () => {
    if (!needsQuote || !pinOk || !pkgOk || quoting) return;
    setQuoting(true);
    setCalcKey(shipInputKeyOf());
    setQuote({ s: "calc" });
    try {
      const res = await fetch("/api/shipping/service-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pincode: addr.pincode.trim(),
          lengthCm: pkgNums.L,
          widthCm: pkgNums.W,
          heightCm: pkgNums.H,
          weightKg: pkgNums.g / 1000,
          mode: shipMode,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success: boolean; forwardPaise?: number; errorCode?: string; message?: string }
        | null;
      if (!res.ok || !data?.success || data.forwardPaise == null) {
        const msg =
          data?.errorCode === "PINCODE_UNAVAILABLE"
            ? "Shipping is currently unavailable for this PIN code."
            : data?.message ?? "Unable to calculate shipping right now. Please check your PIN code and package details.";
        setQuote({ s: "fail", msg });
        return;
      }
      setQuote({ s: "ok", forwardPaise: data.forwardPaise });
    } catch {
      setQuote({ s: "fail", msg: "Unable to calculate shipping right now. Please check your PIN code and package details." });
    } finally {
      setQuoting(false);
    }
  };

  // Restore a stashed configuration (customer clicked "Edit Configuration").
  // sessionStorage is only readable after mount, so this state sync is intentional.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const stored = loadStoredCheckout();
    if (!stored) return;
    const dev = stored.deviceType === "MOUSE" ? "MOUSE" : "KEYBOARD";
    setDevice(dev);
    setSelected(new Set(stored.serviceIds));
    if (stored.switchQuantity > 0) {
      setQty((q) => (dev === "KEYBOARD"
        ? { ...q, sw: stored.switchQuantity, stab: stored.stabilizerQuantity || q.stab }
        : { ...q, msw: stored.switchQuantity }));
    }
    if (dev === "KEYBOARD") {
      if (typeof stored.layout === "string") setLayout(stored.layout);
      setKeycaps(stored.keycapsIncluded ? "Keycaps Included" : "No Keycaps");
    }
    setDetails((d) => ({
      ...d,
      [dev]: {
        brand: stored.brand ?? "",
        model: stored.model ?? "",
        switchModel: stored.switchModel ?? "",
      },
    }));
    const sh = stored.shipping;
    if (stored.contact) {
      const c = stored.contact as ModsContactInput & { name?: string };
      // Legacy stashes stored a single joined `name` — split on restore.
      if (c.firstName === undefined && typeof c.name === "string") {
        const parts = c.name.trim().split(/\s+/);
        setContact({ firstName: parts[0] ?? "", lastName: parts.slice(1).join(" "), phone: c.phone, email: c.email, alt: c.alt });
      } else {
        setContact(c);
      }
    }
    if (sh) {
      setShipMethod(sh.method);
      if (sh.mode === "surface") setShipMode("surface");
      if (sh.address) setAddr({ ...sh.address, landmark: sh.address.landmark ?? "" });
      if (sh.package)
        setPkg({
          L: String(sh.package.lengthCm || ""),
          W: String(sh.package.widthCm || ""),
          H: String(sh.package.heightCm || ""),
          g: String((sh.package.weightKg || 0) * 1000),
        });
    }
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Persist a draft of the current configuration so it survives "Back to
  // Configuration" round-trips. Only writes when the checkout session key
  // is absent (i.e. the user is not mid-checkout).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SERVICE_CHECKOUT_KEY)) return;
      const draft: StoredServiceCheckout = {
        deviceType: device,
        brand: details[device].brand,
        model: details[device].model,
        layout,
        switchModel: details[device].switchModel,
        switchQuantity: device === "MOUSE" ? qty.msw : qty.sw,
        stabilizerQuantity: qty.stab,
        keycapsIncluded: keycaps === "Keycaps Included",
        serviceIds: [...selected],
        services: groups.flatMap((g) => g.services).filter((s) => selected.has(s.id)),
      };
      sessionStorage.setItem(MODS_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* private mode */
    }
  }, [device, selected, qty, layout, keycaps, details, groups]);

  // Load saved addresses for logged-in customers (guests get a 401 → empty).
  // Preselect the default one unless a stashed address is already in play —
  // then select its matching card, or fall back to "Use a different address"
  // so the stashed values stay visible/editable.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/addresses")
      .then((r) => (r.ok ? r.json() : null))
      .then((list) => {
        if (cancelled || !Array.isArray(list) || list.length === 0) return;
        setSavedAddresses(list);
        const sa = loadStoredCheckout()?.shipping?.address;
        if (sa?.street) {
          const match = sa.pincode
            ? list.find((a: SavedAddressOption) => a.postalCode === sa.pincode && a.streetAddress === sa.street)
            : undefined;
          if (match) applySavedAddress(match);
          else setUseAddressId("");
          return;
        }
        const def = list.find((a: SavedAddressOption) => a.isDefault) ?? list[0];
        if (def) applySavedAddress(def);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, ConfigService>();
    groups.forEach((g) => g.services.forEach((s) => m.set(s.id, s)));
    return m;
  }, [groups]);

  const counts: Record<DeviceKey, number> = { KEYBOARD: 0, MOUSE: 0 };
  {
    for (const id of selected) {
      const s = byId.get(id);
      if (s && (s.device === "KEYBOARD" || s.device === "MOUSE")) counts[s.device]++;
    }
  }

  /** Services selected for the ACTIVE device only — one job per order. */
  const activeServices = [...selected]
    .map((id) => byId.get(id))
    .filter((s): s is ConfigService => !!s && s.device === device);

  const config: ServiceOrderConfigInput = {
    deviceType: device,
    brand: details[device].brand.trim(),
    model: details[device].model.trim(),
    layout: device === "KEYBOARD" ? layout : null,
    switchModel: details[device].switchModel.trim() || null,
    switchQuantity: device === "KEYBOARD" ? qty.sw : qty.msw,
    stabilizerQuantity: device === "KEYBOARD" ? qty.stab : 0,
    keycapsIncluded: keycaps !== "No Keycaps",
    serviceIds: activeServices.map((s) => s.id),
  };

  /** Live preview — same function the server uses to create the order. */
  const preview = calculateServiceOrder(activeServices.map(toServiceConfig), config);

  const validation: string[] = [];
  {
    if (!config.brand) validation.push("Please enter your device brand.");
    if (!config.model) validation.push("Please enter your device/model.");
    if (preview.selectedCount === 0) validation.push("Select at least one service to continue.");
  }

  /**
   * Anything that affects the shipping quote — method, PIN, package, or the
   * selected services. A quote computed for a different key is stale and its
   * amounts are hidden until the customer recalculates.
   */
  const shipInputKey = shipInputKeyOf();
  const quoteStale = calcKey !== null && calcKey !== shipInputKey;
  const qOk = !quoteStale && quote.s === "ok";
  /** Legs derived from the single forward quote — recomputed instantly when the method switches. */
  const legs =
    qOk && quote.s === "ok" && shipMethod !== "undecided"
      ? deriveLegs(quote.forwardPaise, shipMethod)
      : null;

  const shipTotalPaise: number | null = legs ? legs.totalPaise : null;

  let shipValidation: string | null = null;
  if (needsQuote) {
    if (addr.pincode.trim() !== "" && !pinOk) shipValidation = "Please enter a valid 6-digit PIN code.";
    else if (!pinOk || !pkgOk) shipValidation = "Enter a valid PIN code and package details to calculate shipping.";
    else if (!addrOk) shipValidation = "Enter your full address to continue.";
    else if (quote.s === "calc") shipValidation = "Calculating shipping…";
    else if (quoteStale) shipValidation = "Shipping details changed — recalculate shipping to continue.";
    else if (quote.s === "fail") shipValidation = quote.msg;
    else if (quote.s === "idle") shipValidation = "Calculate shipping to continue.";
  }

  const canCheckout = validation.length === 0 && shipValidation === null && contactValidation.length === 0;

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

  /** One job per order: switching devices drops the other device's selections. */
  const switchDevice = (next: DeviceKey) => {
    if (next === device) return;
    setDevice(next);
    setSelected((prev) => {
      const keep = new Set<string>();
      prev.forEach((id) => {
        const s = byId.get(id);
        if (s && s.device === next) keep.add(id);
      });
      return keep;
    });
  };

  const adjustQty = (key: QtyKey, delta: number) => setQty((q) => ({ ...q, [key]: Math.max(1, q[key] + delta) }));
  const setQtyVal = (key: QtyKey, value: number) => setQty((q) => ({ ...q, [key]: value }));

  const selectLayout = (v: string) => {
    setLayout(v === layout ? null : v);
    const m = LAYOUT_MAP[v];
    if (m) setQty((q) => ({ ...q, sw: m.sw, stab: m.stab }));
  };

  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const payAndConfirm = async () => {
    if (!canCheckout || adding) return;
    setAdding(true);
    setAddError(null);
    try {
      const shipping: ModsShippingInput | null = needsQuote
        ? qOk && quote.s === "ok"
          ? {
              method: shipMethod,
              mode: shipMode,
              address: {
                street: addr.street.trim(),
                landmark: addr.landmark.trim(),
                city: addr.city.trim(),
                state: addr.state.trim(),
                pincode: addr.pincode.trim(),
              },
              package: { lengthCm: pkgNums.L, widthCm: pkgNums.W, heightCm: pkgNums.H, weightKg: pkgNums.g / 1000 },
              quote: legs
                ? { pickupPaise: legs.pickupPaise, returnPaise: legs.returnPaise, totalPaise: legs.totalPaise }
                : { pickupPaise: null, returnPaise: null, totalPaise: null },
              totals: {
                serviceSubtotalPaise: preview.subtotal,
                estimatedTotalPaise: preview.subtotal + (shipTotalPaise ?? 0),
              },
            }
          : null
        : {
            method: "undecided",
            mode: shipMode,
            address: { street: addr.street.trim(), landmark: addr.landmark.trim(), city: addr.city.trim(), state: addr.state.trim(), pincode: addr.pincode.trim() },
            package: pkgOk
              ? { lengthCm: pkgNums.L, widthCm: pkgNums.W, heightCm: pkgNums.H, weightKg: pkgNums.g / 1000 }
              : { lengthCm: 0, widthCm: 0, heightCm: 0, weightKg: 0 },
            quote: { pickupPaise: null, returnPaise: null, totalPaise: null },
          };
      if (!shipping) {
        setAddError("Shipping is not calculated yet. Please check your address and package details.");
        return;
      }
      // Straight to payment: stash the full configuration and let /mods/checkout
      // confirm the booking. No cart detour. Drop any legacy cart service
      // item so checkout's cart path can't resurrect stale shipping data.
      const payload = { ...config, services: activeServices, shipping, contact } satisfies StoredServiceCheckout;
      sessionStorage.setItem(SERVICE_CHECKOUT_KEY, JSON.stringify(payload));
      sessionStorage.setItem(MODS_DRAFT_KEY, JSON.stringify(payload));
      fetch("/api/cart/service", { method: "DELETE" }).catch(() => {});
      router.push("/mods/checkout");
    } catch {
      setAddError("Something went wrong. Please check your connection and try again.");
    } finally {
      setAdding(false);
    }
  };

  const d = details[device];

  return (
    <div className="order-wrap">
      <div className="main-config-stream">
        <div className="panel">
          <p className="panel-tag">Step 01</p>
          <h2 className="panel-title">Device Details</h2>
          <div className="device-tabs" role="tablist">
            {DEVICES.map((dev) => (
              <button
                key={dev}
                type="button"
                className={`device-tab${device === dev ? " active" : ""}`}
                onClick={() => switchDevice(dev)}
                role="tab"
                aria-selected={device === dev}
              >
                {DEVICE_ICON[dev]} {DEVICE_LABEL[dev]}
                {counts[dev] > 0 && <span className="tab-count">{counts[dev]}</span>}
              </button>
            ))}
          </div>

          {device === "KEYBOARD" ? (
            <div className="device-panel" data-device="keyboard" style={{ display: "block" }}>
              <div className="field-stack">
                <div className="field-inline">
                  <label htmlFor="kb-brand">Brand</label>
                  <input
                    id="kb-brand"
                    type="text"
                    value={d.brand}
                    onChange={(e) => setDetails((s) => ({ ...s, KEYBOARD: { ...s.KEYBOARD, brand: e.target.value } }))}
                    placeholder="e.g. Keychron, Mode, Akko…"
                  />
                </div>
                <div className="field-inline">
                  <label htmlFor="kb-model">Keyboard Model / PCB Name</label>
                  <input
                    id="kb-model"
                    type="text"
                    value={d.model}
                    onChange={(e) => setDetails((s) => ({ ...s, KEYBOARD: { ...s.KEYBOARD, model: e.target.value } }))}
                    placeholder="e.g. Neo65, Keychron Q1, Mode Envoy…"
                  />
                </div>
                <div className="field-inline">
                  <label>Keyboard Layout</label>
                <div className="pill-radio-group pill-radio-lg">
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
                  <label htmlFor="kb-switch-model">Switch Model</label>
                  <input
                    id="kb-switch-model"
                    type="text"
                    value={d.switchModel}
                    onChange={(e) => setDetails((s) => ({ ...s, KEYBOARD: { ...s.KEYBOARD, switchModel: e.target.value } }))}
                    placeholder="e.g. Gateron Cream Soda, HMX Xinhai…"
                  />
                </div>
                <div className="field-inline">
                  <label>Are Keycaps Included?</label>
                  <div className="pill-radio-group pill-radio-lg">
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
          ) : (
            <div className="device-panel" data-device="mouse" style={{ display: "block" }}>
              <div className="field-stack">
                <div className="field-inline">
                  <label htmlFor="ms-brand">Brand</label>
                  <input
                    id="ms-brand"
                    type="text"
                    value={d.brand}
                    onChange={(e) => setDetails((s) => ({ ...s, MOUSE: { ...s.MOUSE, brand: e.target.value } }))}
                    placeholder="e.g. Logitech, Razer, VAXEE…"
                  />
                </div>
                <div className="field-inline">
                  <label htmlFor="ms-model">Mouse Model</label>
                  <input
                    id="ms-model"
                    type="text"
                    value={d.model}
                    onChange={(e) => setDetails((s) => ({ ...s, MOUSE: { ...s.MOUSE, model: e.target.value } }))}
                    placeholder="e.g. G Pro X Superlight 2, Razer Viper V3 Pro…"
                  />
                </div>
                <div className="field-inline">
                  <label>Component Quantities</label>
                  <div className="qty-stack-row">
                    <QtyControl label="Number of Switches" id="msw" value={qty.msw} onChange={adjustQty} onSetValue={setQtyVal} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <p className="panel-tag">Step 02</p>
          <h2 className="panel-title">Available {DEVICE_LABEL[device]} Mods</h2>
          <DevicePanel dev="KEYBOARD" active={device === "KEYBOARD"} groups={groups} selected={selected} onToggle={toggle} />
          <DevicePanel dev="MOUSE" active={device === "MOUSE"} groups={groups} selected={selected} onToggle={toggle} />
        </div>

        <div className="panel">
          <p className="panel-tag">Step 03</p>
          <h2 className="panel-title">Your Details</h2>
          <div className="field-stack" style={{ marginTop: 14 }}>
            <div className="ri-field-row">
              <div className="form-row">
                <label htmlFor="ct-first-name">First Name</label>
                <input
                  id="ct-first-name"
                  type="text"
                  autoComplete="given-name"
                  value={contact.firstName}
                  onChange={(e) => setContact((c) => ({ ...c, firstName: e.target.value }))}
                  placeholder="Your first name"
                />
              </div>
              <div className="form-row">
                <label htmlFor="ct-last-name">Last Name</label>
                <input
                  id="ct-last-name"
                  type="text"
                  autoComplete="family-name"
                  value={contact.lastName}
                  onChange={(e) => setContact((c) => ({ ...c, lastName: e.target.value }))}
                  placeholder="Your last name"
                />
              </div>
            </div>
            <div className="ri-field-row">
              <div className="form-row">
                <label htmlFor="ct-phone">WhatsApp / Phone</label>
                <input
                  id="ct-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={contact.phone}
                  onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                  placeholder="9998888000"
                  aria-invalid={contact.phone !== "" && !phoneOk}
                />
                {contact.phone !== "" && !phoneOk && (
                  <span className="inline-note" style={{ color: "var(--warn)" }}>Enter a valid WhatsApp / phone number.</span>
                )}
              </div>
              <div className="form-row">
                <label htmlFor="ct-email">Email</label>
                <input
                  id="ct-email"
                  type="email"
                  autoComplete="email"
                  value={contact.email}
                  onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))}
                  placeholder="your@email.com"
                  aria-invalid={contact.email !== "" && !emailOk}
                />
                {contact.email !== "" && !emailOk && (
                  <span className="inline-note" style={{ color: "var(--warn)" }}>Enter a valid email address.</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <p className="panel-tag">Step 04</p>
          <h2 className="panel-title">Shipping &amp; Packaging</h2>
          <div className="field-stack" style={{ marginTop: 14 }}>
            <label>Shipping / Pickup address</label>
            {savedAddresses.length > 0 ? (
              <AddressPicker
                addresses={savedAddresses}
                selectedId={useAddressId}
                onSelect={(id) => {
                  if (id === "") setUseAddressId("");
                  else {
                    const a = savedAddresses.find((x) => x.id === id);
                    if (a) applySavedAddress(a);
                  }
                }}
              />
            ) : (
              <span className="total-note" style={{ textAlign: "left" }}>
                Enter the full address below.
              </span>
            )}
            {(savedAddresses.length === 0 || useAddressId === "") && (
              <>
            <div className="field-inline">
              <label htmlFor="ship-street">Street Address</label>
              <input
                id="ship-street"
                type="text"
                value={addr.street}
                onChange={(e) => setAddr((a) => ({ ...a, street: e.target.value }))}
                placeholder={shipMethod === "pickup" ? "Pickup address — house, street…" : "Return destination — house, street…"}
              />
            </div>
            <div className="field-inline">
              <label htmlFor="ship-landmark">Landmark (Optional)</label>
              <input
                id="ship-landmark"
                type="text"
                value={addr.landmark}
                onChange={(e) => setAddr((a) => ({ ...a, landmark: e.target.value }))}
                placeholder="Near metro station, opposite park…"
              />
            </div>
            <div className="addr-city-row">
              <div className="field-inline">
                <label htmlFor="ship-city">City</label>
                <input id="ship-city" type="text" value={addr.city} onChange={(e) => setAddr((a) => ({ ...a, city: e.target.value }))} placeholder="City" />
              </div>
              <div className="field-inline">
                <label htmlFor="ship-state">State</label>
                <select
                  id="ship-state"
                  value={addr.state}
                  onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value }))}
                  autoComplete="address-level1"
                >
                  <option value="">Select state…</option>
                  {INDIAN_STATES.map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
              <div className="field-inline">
                <label htmlFor="ship-pincode">PIN Code</label>
                <input
                  id="ship-pincode"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={addr.pincode}
                  onChange={(e) => setAddr((a) => ({ ...a, pincode: e.target.value.replace(/\D/g, "") }))}
                  placeholder="6-digit PIN"
                  aria-invalid={addr.pincode !== "" && !pinOk}
                />
                {addr.pincode !== "" && !pinOk && (
                  <span className="inline-note" style={{ color: "var(--warn)" }}>Please enter a valid 6-digit PIN code.</span>
                )}
              </div>
            </div>
              </>
            )}
          </div>

          <div className="field-inline" style={{ marginTop: 16 }}>
            <label>How will your device reach us?</label>
            <div className="pill-radio-group pill-radio-lg">
              {(
                [
                  ["customer_shipping", "I'll ship the device"],
                  ["pickup", "Need pickup"],
                ] as [Exclude<ModsShippingMethod, "undecided">, string][]
              ).map(([m, label]) => (
                <label key={m} className={`pill-radio${shipMethod === m ? " selected" : ""}`}>
                  <input type="radio" name="ship-method" checked={shipMethod === m} onChange={() => setShipMethod(m)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <div className="total-note" style={{ textAlign: "left", marginTop: 8 }}>
              {shipMethod === "customer_shipping" &&
                "You'll ship your device to us. We'll ship it back after the work is completed."
              }
              {shipMethod === "pickup" && "We'll arrange pickup from your address and ship the device back after the work is completed."}
            </div>
            {needsQuote && modes.length > 1 && (
              <div className="field-inline" style={{ marginTop: 12 }}>
                <label>Delivery Speed</label>
                <div className="pill-radio-group pill-radio-lg">
                  {modes.map((mode) => (
                    <label key={mode} className={`pill-radio${shipMode === mode ? " selected" : ""}`}>
                      <input type="radio" name="ship-mode" checked={shipMode === mode} onChange={() => setShipMode(mode)} />
                      <span>{mode === "surface" ? "Surface" : "Express"}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <h3 className="panel-title" style={{ marginTop: 22 }}>Package Details</h3>
          <div className="total-note" style={{ textAlign: "left", marginBottom: 12 }}>
            Enter the final packed dimensions and weight, including the box and protective packaging.
          </div>
          <div className="field-stack">
            <div className="field-inline">
              <label>Packed Size (cm)</label>
              <div className="pkg-grid">
                <div className="pkg-cell">
                  <span className="pkg-label">Length</span>
                  <input
                    aria-label="Length in cm"
                    type="number"
                    min={1}
                    max={PACKAGE_LIMITS.MAX_DIM_CM}
                    value={pkg.L}
                    onChange={(e) => setPkg((p) => ({ ...p, L: e.target.value.replace(/[^\d.]/g, "") }))}
                    placeholder="30"
                  />
                </div>
                <div className="pkg-cell">
                  <span className="pkg-label">Width</span>
                  <input
                    aria-label="Width in cm"
                    type="number"
                    min={1}
                    max={PACKAGE_LIMITS.MAX_DIM_CM}
                    value={pkg.W}
                    onChange={(e) => setPkg((p) => ({ ...p, W: e.target.value.replace(/[^\d.]/g, "") }))}
                    placeholder="20"
                  />
                </div>
                <div className="pkg-cell">
                  <span className="pkg-label">Height</span>
                  <input
                    aria-label="Height in cm"
                    type="number"
                    min={1}
                    max={PACKAGE_LIMITS.MAX_DIM_CM}
                    value={pkg.H}
                    onChange={(e) => setPkg((p) => ({ ...p, H: e.target.value.replace(/[^\d.]/g, "") }))}
                    placeholder="10"
                  />
                </div>
              </div>
              {needsQuote && !dimsOk && (pkg.L !== "" || pkg.W !== "" || pkg.H !== "") && (
                <span className="inline-note" style={{ color: "var(--warn)", display: "block", marginTop: 6 }}>
                  Enter valid package dimensions.
                </span>
              )}
            </div>
            <div className="field-inline pkg-weight">
              <label htmlFor="pkg-g">Weight (g)</label>
              <input
                id="pkg-g"
                type="number"
                min={1}
                max={PACKAGE_LIMITS.MAX_WEIGHT_KG * 1000}
                step={100}
                value={pkg.g}
                onChange={(e) => setPkg((p) => ({ ...p, g: e.target.value.replace(/[^\d.]/g, "") }))}
                placeholder="e.g. 2500"
                aria-invalid={pkg.g !== "" && !weightOk}
              />
              {needsQuote && pkg.g !== "" && !weightOk && (
                <span className="inline-note" style={{ color: "var(--warn)" }}>
                  Enter a valid package weight.
                </span>
              )}
            </div>
            {needsQuote && (
              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn-prime kf-checkout-btn"
                  onClick={calculateShippingNow}
                  disabled={!pinOk || !pkgOk || quoting}
                  style={!pinOk || !pkgOk || quoting ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
                >
                  {quoting ? "Calculating shipping…" : "Calculate Shipping"}
                </button>
                {quoteStale && (
                  <span className="inline-note" role="status" style={{ color: "var(--warn)", marginLeft: 10 }}>
                    Shipping details changed — recalculate shipping to continue.
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="sticky-summary-hub">
        <div className="panel">
          <p className="panel-tag">Live Preview</p>
          <h2 className="panel-title">Order Preview</h2>

          <div className="summary-head">
            {preview.selectedCount > 0 ? (
              <>
                <span className="summary-count-chip">
                  {preview.selectedCount} {preview.selectedCount === 1 ? "service" : "services"}
                </span>
                <span className="summary-devs">
                  {DEVICE_ICON[device]} {DEVICE_LABEL[device]}
                </span>
              </>
            ) : (
              <span className="summary-devs">Nothing selected yet</span>
            )}
          </div>

          <div className={`summary-box${preview.selectedCount === 0 ? " empty" : ""}`}>
            {preview.selectedCount === 0 ? (
              <div className="summary-empty">
                <span className="summary-empty-ico">◇</span>
                  <span>Pick services below and fill in your device details to build your order.</span>
              </div>
            ) : (
              <div className="summary-list">
                <div className="summary-line">
                  <div className="summary-line-info">
                    <div className="summary-line-name">{DEVICE_LABEL[device]}</div>
                    {config.layout && <div className="summary-line-meta">Layout · {config.layout}</div>}
                  </div>
                  <div className="summary-line-amt summary-line-meta" style={{ textAlign: "right" }}>
                    {[config.brand, config.model].filter(Boolean).join(" ")}
                    {config.keycapsIncluded ? "" : " · no keycaps"}
                  </div>
                </div>
                <div className="summary-line lined">
                  <div className="summary-line-info">
                    <div className="summary-line-meta">Components</div>
                    <div className="summary-line-meta">
                      {config.switchQuantity} switches
                      {device === "KEYBOARD" ? ` · ${config.stabilizerQuantity} stabilizers` : ""}
                    </div>
                  </div>
                </div>
                {preview.lines.map((l) => (
                  <div key={l.serviceId} className="summary-line lined">
                    <div className="summary-line-info">
                      <div className="summary-line-name">{l.serviceName}</div>
                      <div className="summary-line-meta">
                        {l.isQuote
                          ? "QUOTE REQUIRED — confirmed after inspection"
                          : `${l.quantity} × ${amt(l.unitPrice ?? 0)}${l.unit === "PER_SWITCH" ? "/SW" : l.unit === "PER_STABILIZER" ? "/EA" : ""}`}
                      </div>
                    </div>
                    <div className="summary-line-amt">
                      {l.isQuote ? <span className="quote-chip">{l.priceText}</span> : `₹${amt(l.lineTotal ?? 0)}`}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="total-container">
            {preview.selectedCount === 0 ? (
              <>
                <div className="total-row">
                  <span className="total-label">Estimated Total</span>
                  <span className="total-amount" style={{ fontSize: "1.2rem", color: "var(--t3)" }}>—</span>
                </div>
                {shipValidation && (
                  <div className="inline-note" role="status" style={{ color: quote.s === "fail" && !quoteStale ? "var(--err)" : "var(--warn)", marginTop: 10 }}>
                    {shipValidation}
                  </div>
                )}
                {!needsQuote && (
                  <div className="total-note" style={{ textAlign: "left" }}>* Shipping will be confirmed once you choose how to send your device.</div>
                )}
              </>
            ) : (
              <>
                <div className="total-row">
                  <span className="total-label">Service Subtotal</span>
                  <span className="total-amount" style={{ fontSize: "1.35rem", color: "var(--t1)" }}>₹{amt(preview.subtotal)}</span>
                </div>

                {needsQuote && (
                  <div className="total-row lined" style={{ flexDirection: "column", alignItems: "stretch", gap: 4 }}>
                    {shipMethod === "pickup" && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span className="total-label">Pickup shipping</span>
                        <span className="summary-line-amt">
                          {legs ? `₹${amt(legs.pickupPaise)}` : quote.s === "calc" ? "…" : "—"}
                        </span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="total-label">Return shipping</span>
                      <span className="summary-line-amt">
                        {legs ? `₹${amt(legs.returnPaise)}` : quote.s === "calc" ? "…" : "—"}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px dashed var(--bdr)", paddingTop: 4 }}>
                      <span className="total-label">Total shipping</span>
                      <span className="summary-line-amt">
                        {legs
                          ? `₹${amt(legs.totalPaise)}`
                          : quote.s === "calc"
                            ? "Calculating shipping…"
                            : "—"}
                      </span>
                    </div>
                    {quote.s === "fail" && !quoteStale && (
                      <span className="inline-note" role="alert" style={{ color: "var(--err)" }}>{quote.msg}</span>
                    )}
                  </div>
                )}

                {!needsQuote && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span className="total-label">Shipping</span>
                      <span className="summary-line-amt">—</span>
                    </div>
                    <div className="total-note" style={{ textAlign: "left" }}>Shipping calculated after confirmation.</div>
                  </>
                )}

                <div className="total-row" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed var(--bdr)" }}>
                  <span className="total-label">Estimated Total</span>
                  <span className="total-amount">₹{amt(preview.subtotal + (shipTotalPaise ?? 0))}</span>
                </div>
              </>
            )}

            {validation.length > 0 && preview.selectedCount > 0 && (
              <div className="inline-note" role="status" style={{ color: "var(--warn)", marginTop: 10 }}>
                {validation.join(" ")}
              </div>
            )}

            {shipValidation && (
              <div className="inline-note" role="status" style={{ color: quote.s === "fail" && !quoteStale ? "var(--err)" : "var(--warn)", marginTop: 10 }}>
                {shipValidation}
              </div>
            )}

            {addError && (
              <div className="inline-note" role="alert" style={{ color: "var(--err)", marginTop: 10 }}>
                {addError}
              </div>
            )}

            <button
              type="button"
              className="btn-prime kf-checkout-btn"
              onClick={payAndConfirm}
              disabled={!canCheckout || adding}
              style={!canCheckout || adding ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
            >
              {adding ? "Preparing…" : "Pay & Confirm"}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M3 13L13 3M13 3H6M13 3V10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
