"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatINR } from "@/lib/money";
import { RazorpayScript } from "@/components/payments/RazorpayScript";
import { AffordabilityWidget } from "@/components/payments/AffordabilityWidget";
import {
  calculateServiceOrder,
  type ServiceConfig,
} from "@/lib/services/pricing";
import { SERVICE_CHECKOUT_KEY, type ConfigService, type StoredServiceCheckout } from "@/components/services/ServiceConfigurator";
import { AddressPicker, type SavedAddressOption } from "@/components/services/AddressPicker";
import { INDIAN_STATES } from "@/lib/indian-states";
import { launchRazorpayPayment, type CreateOrderResponse } from "@/lib/razorpay-pay";
import { CouponPanel, type AppliedCoupon } from "@/components/checkout/CouponPanel";

interface SavedAddress {
  id: string;
  label: string;
  name: string | null;
  email: string | null;
  streetAddress: string;
  apartment: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string | null;
  isDefault: boolean;
}

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
};

const EMPTY_FORM: FormData = { firstName: "", lastName: "", email: "", phone: "", streetAddress: "", addressLine2: "", city: "", state: "", postalCode: "" };

type BillingAddress = {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  pinCode: string;
  phone: string;
};

const EMPTY_BILLING: BillingAddress = { fullName: "", addressLine1: "", addressLine2: "", city: "", state: "", pinCode: "", phone: "" };

/** Clears the stashed service job once its order exists (or was abandoned).
 *  Preserves the modsConfigDraft so the user can return to /mods without losing their work. */
async function clearServiceCartItem() {
  try {
    await fetch("/api/cart/service", { method: "DELETE" });
  } catch {
    /* best-effort */
  }
  try {
    sessionStorage.removeItem(SERVICE_CHECKOUT_KEY);
  } catch {
    /* private mode */
  }
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

/* ────────────────────────── Service checkout ─────────────────────────── */

export function ServiceCheckout({
  config,
  razorpayKeyId,
}: {
  config: StoredServiceCheckout;
  razorpayKeyId: string | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormData>(() => ({
    ...EMPTY_FORM,
    // Mods configurator already collected contact + address — carry them over.
    firstName: config.contact?.firstName ?? "",
    lastName: config.contact?.lastName ?? "",
    email: config.contact?.email ?? "",
    phone: config.contact?.phone ?? "",
    streetAddress: config.shipping?.address?.street ?? "",
    city: config.shipping?.address?.city ?? "",
    state: config.shipping?.address?.state ?? "",
    postalCode: config.shipping?.address?.pincode ?? "",
  }));
  const [addresses, setAddresses] = useState<SavedAddressOption[]>([]);
  const [selectedAddrId, setSelectedAddrId] = useState<string | null>(null);
  // True until the saved-address request settles — prevents the manual form
  // flashing before we know whether saved addresses exist.
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  // Billing: defaults to the shipping address; independent fields only when
  // the customer opts out. ponytail: not persisted server-side yet (no Order
  // billing columns) — payload fields are forward-compatible extras.
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<BillingAddress>(EMPTY_BILLING);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [saveAddress, setSaveAddress] = useState(false);

  const cfg = useMemo(
    () => ({
      deviceType: config.deviceType,
      brand: config.brand,
      model: config.model,
      layout: config.layout ?? null,
      switchModel: config.switchModel ?? null,
      switchQuantity: config.switchQuantity,
      stabilizerQuantity: config.stabilizerQuantity,
      keycapsIncluded: config.keycapsIncluded,
      serviceIds: config.serviceIds,
    }),
    [config]
  );

  // Display-only preview; the server recalculates everything on order creation.
  const preview = useMemo(
    () => calculateServiceOrder(config.services.map(toServiceConfig), cfg),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config]
  );

  const fieldErrors = useMemo(() => validateForm(form), [form]);

  // Display-only shipping for decided mods methods (server re-quotes on pay).
  const modShipPaise =
    config.shipping && config.shipping.method !== "undecided" && config.shipping.quote.returnPaise
      ? config.shipping.method === "pickup"
        ? (config.shipping.quote.pickupPaise ?? 0) + config.shipping.quote.returnPaise
        : config.shipping.quote.returnPaise
      : 0;
  const discount = coupon?.discount ?? 0;
  const payableTotal = Math.max(0, preview.total + modShipPaise - discount);

  // Stash values are fixed at mount — read them as plain consts so the
  // prefill effect can reference them without stale-closure lint noise.
  const stashStreet = config.shipping?.address?.street ?? "";
  const stashPin = config.shipping?.address?.pincode ?? "";

  // Prefill for logged-in customers + saved addresses.
  useEffect(() => {
    let cancelled = false;
    async function prefill() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (meRes.ok) {
          const me = await meRes.json();
          if (!cancelled) {
            const parts = (me.profile?.name || me.user?.name || "").trim().split(/\s+/);
            setForm((f) => ({
              ...f,
              firstName: f.firstName || (parts[0] ?? ""),
              lastName: f.lastName || parts.slice(1).join(" "),
              email: f.email || me.user?.email || "",
              phone: f.phone || me.profile?.phone || "",
            }));
          }
          try {
            const addrRes = await fetch("/api/account/addresses");
            if (addrRes.ok) {
              const list = (await addrRes.json()) as SavedAddressOption[];
              if (!cancelled && Array.isArray(list) && list.length > 0) {
                setAddresses(list);
                // Address already carried over from /mods — select its card
                // when it matches a saved one, else reveal the manual fields.
                if (stashStreet) {
                  const match = stashPin
                    ? list.find((a) => a.postalCode === stashPin && a.streetAddress === stashStreet)
                    : undefined;
                  setSelectedAddrId(match ? match.id : "");
                  return;
                }
                const def = list.find((a) => a.isDefault) ?? list[0];
                setSelectedAddrId(def.id);
                setForm((f) => ({
                  ...f,
                  streetAddress: def.streetAddress,
                  city: def.city,
                  state: def.state,
                  postalCode: def.postalCode,
                  phone: f.phone || def.phone || "",
                }));
              }
            }
          } catch {
            /* addresses are optional */
          }
        }
      } catch {
        /* guest checkout — nothing to prefill */
      }
    }
    void prefill().finally(() => {
      // Every exit path (guest 401, empty list, error) ends the loading state.
      if (!cancelled) setAddressesLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [stashStreet, stashPin]);

  const applySavedAddress = (id: string) => {
    const a = addresses.find((x) => x.id === id);
    if (!a) return;
    const parts = (a.name || "").trim().split(/\s+/);
    setForm((f) => ({
      ...f,
      firstName: f.firstName || (parts[0] ?? ""),
      lastName: f.lastName || parts.slice(1).join(" "),
      email: a.email || f.email,
      streetAddress: a.streetAddress,
      addressLine2: a.apartment || "",
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      phone: a.phone || f.phone,
    }));
  };

  const handleSelectAddress = (id: string) => {
    setSelectedAddrId(id);
    if (id !== "") applySavedAddress(id);
  };

  async function handlePay() {
    setShowErrors(true);
    if (Object.keys(fieldErrors).length > 0) return;
    if (!billingSame && Object.keys(billingErrors).length > 0) return;

    setPaymentLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/services/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cfg,
          ...(config.contact?.alt ? { contactNote: config.contact.alt } : {}),
          ...(config.shipping
            ? {
                modsShipping: {
                  method: config.shipping.method,
                  mode: config.shipping.mode,
                  address: { pincode: config.shipping.address.pincode || form.postalCode.trim() },
                  package: config.shipping.package,
                },
              }
            : {}),
          customer: { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone.trim() },
          shippingAddress: {
            streetAddress: form.streetAddress.trim(),
            addressLine2: form.addressLine2.trim() || undefined,
            city: form.city.trim(),
            state: form.state.trim(),
            postalCode: form.postalCode.trim(),
            country: "India",
          },
          billingSameAsShipping: billingSame,
          saveAddress: selectedAddrId === "" && saveAddress,
          couponCode: coupon?.code ?? undefined,
          ...(billingSame
            ? {}
            : {
                billingAddress: {
                  fullName: billing.fullName.trim(),
                  addressLine1: billing.addressLine1.trim(),
                  addressLine2: billing.addressLine2.trim() || undefined,
                  city: billing.city.trim(),
                  state: billing.state.trim(),
                  pinCode: billing.pinCode.trim(),
                  phone: billing.phone.trim(),
                  country: "India",
                },
              }),
        }),
      });
      const data = (await res.json()) as CreateOrderResponse;
      if (!res.ok) {
        setError(data.error ?? "Failed to create your order. Please try again.");
        setPaymentLoading(false);
        return;
      }

      if (data.requiresQuote) {
        void clearServiceCartItem();
        router.push(`/order/success/${data.orderNumber}?quote=1`);
        return;
      }
      openRazorpay(data);
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setPaymentLoading(false);
    }
  }

  function openRazorpay(orderData: CreateOrderResponse) {
    launchRazorpayPayment({
      order: orderData,
      description: `Service Order ${orderData.orderNumber}`,
      prefill: { name: `${form.firstName} ${form.lastName}`.trim(), email: form.email, contact: form.phone },
      onVerified: () => {
        void clearServiceCartItem();
        router.push(`/order/success/${orderData.orderNumber}`);
      },
      onDismissed: () => {
        setError("Payment was cancelled. You have not been charged.");
        setPaymentLoading(false);
      },
      onError: (msg) => {
        setError(msg);
        setPaymentLoading(false);
      },
    });
  }

  const deviceIcon = cfg.deviceType === "KEYBOARD" ? "⌨️" : "🖱️";
  const deviceLabel = cfg.deviceType === "KEYBOARD" ? "Keyboard" : "Mouse";
  const billingErrors = validateBilling(billing);
  const formValid = Object.keys(fieldErrors).length === 0 && (billingSame || Object.keys(billingErrors).length === 0);
  const quoteOnly = preview.subtotal === 0 && preview.hasQuotes;

  // Display-only shipping breakdown (server re-quotes on pay).
  const shipQuote = config.shipping?.quote ?? null;
  const showShipBreakdown = config.shipping && config.shipping.method !== "undecided";

  return (
    <main className="checkout-page">
      <RazorpayScript />
      <section className="svc-section">
        <div className="wrap">
          <p className="panel-tag">CHECKOUT</p>
          <h1 className="sec-title font-display">Review &amp; Pay</h1>
          <p className="sec-desc text-[var(--t3)]">
            Confirm your details — your build is ready for the bench.
          </p>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
            {/* ── Left column: customer + shipping ── */}
            <div className="flex flex-col gap-4 min-w-0">
              <section className="card">
                <p className="panel-tag">STEP 01</p>
                <h2 className="panel-title">Customer Details</h2>
                <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                  <Field label="First Name *" error={showErrors ? fieldErrors.firstName : undefined}>
                    <input type="text" className={fieldClass(!!(showErrors && fieldErrors.firstName))} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} placeholder="Your first name" autoComplete="given-name" />
                  </Field>
                  <Field label="Last Name *" error={showErrors ? fieldErrors.lastName : undefined}>
                    <input type="text" className={fieldClass(!!(showErrors && fieldErrors.lastName))} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} placeholder="Your last name" autoComplete="family-name" />
                  </Field>
                  <Field label="Phone / WhatsApp *" error={showErrors ? fieldErrors.phone : undefined}>
                    <input type="tel" className={fieldClass(!!(showErrors && fieldErrors.phone))} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+91 98765 43210" autoComplete="tel" />
                  </Field>
                  <Field label="Email *" error={showErrors ? fieldErrors.email : undefined}>
                    <input type="email" className={fieldClass(!!(showErrors && fieldErrors.email))} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" autoComplete="email" />
                  </Field>
                </div>
              </section>

              <section className="card">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="panel-tag">STEP 02</p>
                    <h2 className="panel-title" style={{ marginBottom: 0 }}>Shipping Address</h2>
                  </div>
                  {addresses.length > 0 && (
                    <span className="text-[0.65rem] uppercase tracking-[0.06em] text-[var(--t3)]">
                      {addresses.length} saved
                    </span>
                  )}
                </div>
                {addressesLoading ? (
                  <div className="grid gap-2" aria-busy="true" aria-label="Loading saved addresses">
                    <div className="skeleton h-[62px] w-full" />
                    <div className="skeleton h-11 w-full" style={{ borderRadius: "var(--r-sm)" }} />
                  </div>
                ) : (
                  <>
                    {addresses.length > 0 && (
                      <AddressPicker
                        addresses={addresses}
                        selectedId={selectedAddrId}
                        onSelect={handleSelectAddress}
                      />
                    )}
                    {(addresses.length === 0 || selectedAddrId === "") && (
                      <div className="grid gap-5 mt-5">
                        <Field label="Address Line 1 *" error={showErrors ? fieldErrors.streetAddress : undefined}>
                          <input type="text" className={fieldClass(!!(showErrors && fieldErrors.streetAddress))} value={form.streetAddress} onChange={(e) => setForm({ ...form, streetAddress: e.target.value })} placeholder="House/Flat/Building, Street, Area" autoComplete="address-line1" />
                        </Field>
                        <Field label="Address Line 2 · Landmark (Optional)">
                          <input type="text" className="shop-field w-full" value={form.addressLine2} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} placeholder="Near metro station, opposite park…" autoComplete="address-line2" />
                        </Field>
                        <div className="addr-city-row">
                          <Field label="City *" error={showErrors ? fieldErrors.city : undefined}>
                            <input type="text" className={fieldClass(!!(showErrors && fieldErrors.city))} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="City" autoComplete="address-level2" />
                          </Field>
                          <Field label="State *" error={showErrors ? fieldErrors.state : undefined}>
                            <select className={`shop-select w-full${showErrors && fieldErrors.state ? " error" : ""}`} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} autoComplete="address-level1">
                              <option value="">Select State</option>
                              {INDIAN_STATES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </Field>
                          <Field label="PIN Code *" error={showErrors ? fieldErrors.postalCode : undefined}>
                            <input type="text" inputMode="numeric" maxLength={6} className={fieldClass(!!(showErrors && fieldErrors.postalCode))} value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value.replace(/\D/g, "") })} placeholder="110001" autoComplete="postal-code" />
                          </Field>
                        </div>
                        {(selectedAddrId === "" || addresses.length === 0) && (
                          <label className="flex items-center gap-2 text-sm text-[var(--t2)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={saveAddress}
                              onChange={(e) => setSaveAddress(e.target.checked)}
                              className="accent-[var(--acc)]"
                            />
                            Save this address to my account
                          </label>
                        )}
                      </div>
                    )}
                  </>
                )}
              </section>

              {/* ── 03 · Payment ── */}
              <section className="card">
                <p className="panel-tag">STEP 03</p>
                <h2 className="panel-title" style={{ marginBottom: 12 }}>Payment</h2>
                <p className="text-sm text-[var(--t3)]">All transactions are secure and encrypted.</p>
                <label
                  className="block rounded-lg border border-[var(--acc)] bg-[var(--bg2)] p-4 cursor-pointer"
                  style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--acc) 35%, transparent)" }}
                >
                  <span className="flex items-start gap-3">
                    <input type="radio" name="paymentMethod" checked readOnly className="mt-1 shrink-0" style={{ accentColor: "var(--acc)" }} aria-label="Razorpay payment gateway" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3 flex-wrap">
                        <span>
                          <span className="font-display font-bold text-sm text-[var(--t1)] block">Razorpay Payment Gateway</span>
                          <span className="text-xs text-[var(--t3)]">UPI, Cards, International Cards, Wallets</span>
                        </span>
                        <span className="flex items-center gap-1.5 flex-wrap" aria-hidden="true">
                          <span className="text-[0.65rem] font-bold tracking-wide px-2 py-1 rounded border border-[var(--bdr)] bg-[var(--bg1)] text-[var(--t2)]">UPI</span>
                          <span className="text-[0.65rem] font-bold italic tracking-wide px-2 py-1 rounded border border-[var(--bdr)] bg-[var(--bg1)] text-[var(--t2)]">VISA</span>
                          <span className="flex items-center px-2 py-1 rounded border border-[var(--bdr)] bg-[var(--bg1)]">
                            <span className="inline-block w-3 h-3 rounded-full opacity-90" style={{ background: "#EB001B" }} />
                            <span className="inline-block w-3 h-3 rounded-full opacity-90 -ml-1.5" style={{ background: "#F79E1B" }} />
                          </span>
                          <span className="text-[0.65rem] font-medium px-2 py-1 rounded border border-[var(--bdr)] bg-[var(--bg1)] text-[var(--t3)]">+more</span>
                        </span>
                      </span>
                      <span className="block text-xs text-[var(--t3)] mt-2.5">
                        You&apos;ll be redirected to Razorpay&apos;s secure checkout to complete your purchase.
                      </span>
                    </span>
                  </span>
                </label>
              </section>

              {/* ── 04 · Billing Address ── */}
              <section className="card">
                <p className="panel-tag">STEP 04</p>
                <h2 className="panel-title" style={{ marginBottom: 16 }}>Billing Address</h2>
                <div className="grid gap-2">
                  {(
                    [
                      { same: true, label: "Same as shipping address" },
                      { same: false, label: "Use a different billing address" },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.label}
                      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${billingSame === opt.same ? "border-[var(--acc)] bg-[var(--bg2)]" : "border-[var(--bdr)] hover:border-[var(--t3)]"}`}
                    >
                      <input type="radio" name="billingOption" checked={billingSame === opt.same} onChange={() => setBillingSame(opt.same)} className="shrink-0" style={{ accentColor: "var(--acc)" }} />
                      <span className={`text-sm ${billingSame === opt.same ? "font-medium text-[var(--t1)]" : "text-[var(--t2)]"}`}>{opt.label}</span>
                    </label>
                  ))}
                </div>
                {!billingSame && (
                  <div className="grid gap-3 mt-4">
                    <Field label="Full Name *" error={showErrors ? billingErrors.fullName : undefined}>
                      <input type="text" className={fieldClass(!!(showErrors && billingErrors.fullName))} value={billing.fullName} onChange={(e) => setBilling({ ...billing, fullName: e.target.value })} placeholder="Name on the bill" autoComplete="billing name" />
                    </Field>
                    <Field label="Address Line 1 *" error={showErrors ? billingErrors.addressLine1 : undefined}>
                      <input type="text" className={fieldClass(!!(showErrors && billingErrors.addressLine1))} value={billing.addressLine1} onChange={(e) => setBilling({ ...billing, addressLine1: e.target.value })} placeholder="House/Flat/Building, Street, Area" autoComplete="billing address-line1" />
                    </Field>
                    <Field label="Address Line 2 (Optional)">
                      <input type="text" className="shop-field w-full" value={billing.addressLine2} onChange={(e) => setBilling({ ...billing, addressLine2: e.target.value })} placeholder="Landmark (optional)" autoComplete="billing address-line2" />
                    </Field>
                    <div className="addr-city-row">
                      <Field label="City *" error={showErrors ? billingErrors.city : undefined}>
                        <input type="text" className={fieldClass(!!(showErrors && billingErrors.city))} value={billing.city} onChange={(e) => setBilling({ ...billing, city: e.target.value })} placeholder="City" autoComplete="billing address-level2" />
                      </Field>
                      <Field label="State *" error={showErrors ? billingErrors.state : undefined}>
                        <select className={`shop-select w-full${showErrors && billingErrors.state ? " error" : ""}`} value={billing.state} onChange={(e) => setBilling({ ...billing, state: e.target.value })} autoComplete="billing address-level1">
                          <option value="">Select State</option>
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="PIN Code *" error={showErrors ? billingErrors.pinCode : undefined}>
                        <input type="text" inputMode="numeric" maxLength={6} className={fieldClass(!!(showErrors && billingErrors.pinCode))} value={billing.pinCode} onChange={(e) => setBilling({ ...billing, pinCode: e.target.value.replace(/\D/g, "") })} placeholder="110001" autoComplete="billing postal-code" />
                      </Field>
                    </div>
                    <Field label="Phone *" error={showErrors ? billingErrors.phone : undefined}>
                      <input type="tel" className={fieldClass(!!(showErrors && billingErrors.phone))} value={billing.phone} onChange={(e) => setBilling({ ...billing, phone: e.target.value })} placeholder="+91 98765 43210" autoComplete="billing tel" />
                    </Field>
                  </div>
                )}
              </section>
            </div>

            {/* ── Right column: sticky order summary ── */}
            <aside className="card checkout-summary">
              <h2 className="panel-title" style={{ marginBottom: 16 }}>Order Summary</h2>

              {/* Your Configuration */}
              <div className="flex items-start gap-3 pb-4">
                <span
                  aria-hidden="true"
                  className="flex items-center justify-center shrink-0 border border-[var(--bdr)] bg-[var(--bg2)]"
                  style={{ width: 44, height: 44, fontSize: "1.25rem", borderRadius: "var(--r-sm)" }}
                >
                  {deviceIcon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-display font-bold text-[var(--t1)] leading-tight">{cfg.brand} {cfg.model}</p>
                  <p className="text-xs text-[var(--t3)] mt-0.5">
                    {deviceLabel}{cfg.layout ? ` · ${cfg.layout}` : ""}{cfg.switchModel ? ` · ${cfg.switchModel}` : ""}
                  </p>
                  <div className="mt-2 space-y-0.5 text-xs">
                    <CfgRow label="Switches" value={`×${cfg.switchQuantity}`} />
                    {cfg.deviceType === "KEYBOARD" && <CfgRow label="Stabilizers" value={`×${cfg.stabilizerQuantity}`} />}
                    <CfgRow label="Keycaps" value={cfg.keycapsIncluded ? "Included" : "Not included"} />
                  </div>
                </div>
              </div>

              {/* Selected services */}
              <div className="border-t border-[var(--bdr)] pt-3 pb-3">
                <ul className="space-y-2 max-h-56 overflow-y-auto">
                  {preview.lines.map((line) => (
                    <li key={line.serviceId} className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--t1)] truncate">{line.serviceName}</p>
                        <p className="text-xs text-[var(--t3)]">
                          {line.isQuote
                            ? line.priceText === "Quote" ? "QUOTE REQUIRED" : `est. ${line.priceText}`
                            : `${line.quantity} × ${formatINR(line.unitPrice ?? 0)}${line.unit === "PER_SWITCH" ? "/SW" : line.unit === "PER_STABILIZER" ? "/EA" : ""}`}
                        </p>
                      </div>
                      <span className="font-display font-bold text-sm text-[var(--t1)] whitespace-nowrap">
                        {line.isQuote ? <span className="quote-chip">QUOTE</span> : `${formatINR(line.lineTotal ?? 0)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Coupon + pricing */}
              <div className="border-t border-[var(--bdr)] pt-3 space-y-1.5">
                <CouponPanel subtotalPaise={preview.subtotal} coupon={coupon} setCoupon={setCoupon} />
                <div className="border-t border-[var(--bdr)] pt-3 space-y-1.5">
                  <Row label="Subtotal" value={preview.subtotal === 0 ? "—" : `${formatINR(preview.subtotal)}`} />
                  {coupon && (
                    <Row label="Discount" value={<span className="text-[var(--acc)]">−{formatINR(coupon.discount)}</span>} />
                  )}
                  {showShipBreakdown && shipQuote?.returnPaise ? (
                    config.shipping!.method === "pickup" ? (
                      <>
                        <Row label="Pickup Shipping" value={formatINR(shipQuote.pickupPaise ?? 0)} />
                        <Row label="Return Shipping" value={formatINR(shipQuote.returnPaise)} />
                        <Row label={<strong>Total Shipping</strong>} value={<strong>{formatINR(modShipPaise)}</strong>} />
                      </>
                    ) : (
                      <Row label="Return Shipping" value={formatINR(shipQuote.returnPaise)} />
                    )
                  ) : (
                    <Row label="Shipping" value="Calculated after confirmation" />
                  )}
                  <div className="flex items-baseline justify-between pt-3 mt-1 border-t border-[var(--bdr)]">
                    <span className="font-display font-bold text-[var(--t1)]">{quoteOnly ? "Payable Now" : "Total"}</span>
                    <span className="font-display font-bold text-[var(--acc)]" style={{ fontSize: "1.6rem", lineHeight: 1 }}>
                      {quoteOnly ? "₹0" : formatINR(payableTotal)}
                    </span>
                  </div>
                  {quoteOnly && (
                    <p className="text-xs text-[var(--t3)]">Final quote confirmed after inspection.</p>
                  )}
                  {preview.hasQuotes && !quoteOnly && (
                    <p className="text-sm text-[var(--warn)] pt-1">
                      Final pricing for quote-based services will be confirmed after inspection.
                    </p>
                  )}
                </div>
              </div>

              <AffordabilityWidget amountPaise={quoteOnly ? null : payableTotal} keyId={razorpayKeyId} />

              <button
                onClick={handlePay}
                disabled={paymentLoading || !formValid}
                title={!formValid ? "Complete the highlighted fields to continue" : undefined}
                className="btn-prime w-full justify-center mt-5 py-3"
                style={{ fontSize: "1rem", ...(paymentLoading || !formValid ? { opacity: 0.5, cursor: "not-allowed" } : {}) }}
              >
                {paymentLoading ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Processing…
                  </>
                ) : quoteOnly ? (
                  "Submit Quote Request →"
                ) : (
                  <>Pay {formatINR(payableTotal)} →</>
                )}
              </button>
              {!formValid && showErrors && (
                <p className="text-sm text-[var(--err)] mt-2" role="alert">
                  {!billingSame && Object.keys(billingErrors).length > 0 ? Object.values(billingErrors)[0] : Object.values(fieldErrors)[0]}
                </p>
              )}
              {error && (
                <p className="text-sm text-[var(--err)] text-center mt-3" role="alert">{error}</p>
              )}

              <Link href="/mods" className="btn-ghost w-full mt-4 justify-center">
                ← Back to Configuration
              </Link>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}

function CfgRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-[var(--t3)]">{label}</span>
      <span className="text-[var(--t2)] font-medium">{value}</span>
    </div>
  );
}

/* ─────────────────────── Product checkout (final) ─────────────────────── */

interface CheckoutLine {
  id: string;
  quantity: number;
  config: { kind?: string; selections?: { optionName?: string }[] } | null;
  product: { name: string; slug: string; price: number; image?: string | null; freeShipping?: boolean };
  variant: { name: string; price: number | null } | null;
}

interface DeliveryForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  streetAddress: string;
  apartment: string;
  city: string;
  state: string;
  postalCode: string;
}

const EMPTY_DELIVERY: DeliveryForm = {
  firstName: "", lastName: "", email: "", phone: "",
  streetAddress: "", apartment: "", city: "", state: "", postalCode: "",
};

// Customer-safe shipping error texts (server sends the same taxonomy strings).
const SHIPPING_MSGS = {
  PINCODE_UNAVAILABLE: "Shipping unavailable for this pincode.",
  MISSING_SHIPPING_CONFIGURATION: "Shipping information is unavailable for one or more products.",
  GENERIC: "Unable to calculate shipping right now.",
};

type ShipOption = {
  method: "surface" | "express";
  name: string;
  carrier: string;
  amountPaise: number;
  estimatedDays: number;
};

type ShipState =
  | { status: "idle" }
  | { status: "calculating" }
  | { status: "quotes"; options: ShipOption[] }
  | { status: "free" }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

function validateDelivery(f: DeliveryForm, emailRequired: boolean): Partial<Record<keyof DeliveryForm, string>> {
  const e: Partial<Record<keyof DeliveryForm, string>> = {};
  if (!f.firstName.trim()) e.firstName = "First name is required";
  if (!f.lastName.trim()) e.lastName = "Last name is required";
  if (emailRequired) {
    if (!f.email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a valid email";
  }
  if (!f.phone.trim()) e.phone = "Phone number is required";
  else if (!/^[+\d][\d\s-]{5,18}$/.test(f.phone.trim())) e.phone = "Enter a valid phone number";
  if (!f.streetAddress.trim()) e.streetAddress = "Address is required";
  if (!f.city.trim()) e.city = "City is required";
  if (!f.state.trim()) e.state = "State is required";
  if (!f.postalCode.trim()) e.postalCode = "PIN code is required";
  else if (!/^[1-9]\d{5}$/.test(f.postalCode.trim())) e.postalCode = "Enter a valid 6-digit PIN code";
  return e;
}

export function ProductCheckout({ shippingModes, razorpayKeyId }: { shippingModes: ("surface" | "express")[]; razorpayKeyId: string | null }) {
  const router = useRouter();

  // cart + auth data
  const [lines, setLines] = useState<CheckoutLine[] | null>(null);
  const [authUser, setAuthUser] = useState<{ name: string; email: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("new");

  // delivery form
  const [form, setForm] = useState<DeliveryForm>(EMPTY_DELIVERY);
  const [showErrors, setShowErrors] = useState(false);
  const [saveAddress, setSaveAddress] = useState(false);

  // shipping + payment
  const [shipMode, setShipMode] = useState<"surface" | "express">(shippingModes[0] ?? "express");
  const [shipping, setShipping] = useState<ShipState>({ status: "idle" });
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null);
  const [billingSame, setBillingSame] = useState(true);
  const [billing, setBilling] = useState<BillingAddress>(EMPTY_BILLING);

  const setField = (k: keyof DeliveryForm) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: ev.target.value }));
  const setBillingField = (k: keyof BillingAddress) => (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setBilling((b) => ({ ...b, [k]: ev.target.value }));

  // Boot: server cart + account/saved addresses in parallel.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [cartRes, meRes] = await Promise.allSettled([fetch("/api/cart"), fetch("/api/auth/me")]);

      let nextLines: CheckoutLine[] = [];
      if (cartRes.status === "fulfilled" && cartRes.value.ok) {
        const data = await cartRes.value.json().catch(() => null);
        nextLines = Array.isArray(data?.items) ? data.items : [];
      }

      let user: { name: string; email: string } | null = null;
      let addresses: SavedAddress[] = [];
      if (meRes.status === "fulfilled" && meRes.value.ok) {
        const me = await meRes.value.json().catch(() => null);
        if (me?.user?.email) user = { name: me.profile?.name ?? me.user.name ?? "", email: me.user.email };
        try {
          const ar = await fetch("/api/account/addresses");
          if (ar.ok) {
            const ad = await ar.json();
            addresses = Array.isArray(ad?.addresses) ? ad.addresses : [];
          }
        } catch {
          /* saved addresses are optional */
        }
      }

      if (cancelled) return;

      // Prefill: default saved address wins for address fields; account profile for identity.
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      const parts = (user?.name ?? "").trim().split(/\s+/).filter(Boolean);
      const base: DeliveryForm = {
        ...EMPTY_DELIVERY,
        email: user?.email ?? "",
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
      };
      if (def) {
        base.phone = def.phone ?? "";
        base.streetAddress = def.streetAddress;
        base.city = def.city;
        base.state = def.state;
        base.postalCode = def.postalCode;
      }

      setLines(nextLines);
      setAuthUser(user);
      setAuthChecked(true);
      setSavedAddresses(addresses);
      setForm(base);
      if (addresses.length > 0 && def) setSelectedAddressId(def.id);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-calculate shipping whenever a valid PIN code is entered.
  useEffect(() => {
    let cancelled = false;
    const pin = form.postalCode.trim();
    const valid = /^[1-9]\d{5}$/.test(pin);
    const t = setTimeout(async () => {
      if (!valid) {
        setShipping({ status: "idle" });
        return;
      }
      setShipping({ status: "calculating" });
      try {
        const res = await fetch("/api/shipping/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinationPincode: pin }),
        });
        const data = (await res.json().catch(() => null)) as
          | { success?: boolean; free?: boolean; shipping?: ShipOption[]; errorCode?: string; error?: string; message?: string }
          | null;
        if (cancelled) return;
        const reason = data?.message ?? data?.error;
        if (res.ok && data?.success && Array.isArray(data.shipping)) {
          if (data.free || data.shipping.length === 0) {
            setShipping({ status: "free" });
          } else {
            setShipping({ status: "quotes", options: data.shipping });
            // Keep the chosen method if it's available, else fall back to the first quote.
            setShipMode((cur) => (data.shipping!.some((o) => o.method === cur) ? cur : data.shipping![0].method));
          }
        } else if (data?.errorCode === "PINCODE_UNAVAILABLE") {
          setShipping({ status: "unavailable", message: reason ?? SHIPPING_MSGS.PINCODE_UNAVAILABLE });
        } else if (data?.errorCode === "MISSING_SHIPPING_CONFIGURATION") {
          setShipping({ status: "error", message: reason ?? SHIPPING_MSGS.MISSING_SHIPPING_CONFIGURATION });
        } else {
          setShipping({
            status: "error",
            message: reason ?? "Unable to calculate shipping right now.",
          });
        }
      } catch {
        if (!cancelled) setShipping({ status: "error", message: "Could not check shipping availability." });
      }
    }, valid ? 350 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [form.postalCode, shipMode]);

  function pickAddress(id: string) {
    setSelectedAddressId(id);
    setShowErrors(false);
    setError(null);
    if (id === "new") {
      setForm((f) => ({ ...EMPTY_DELIVERY, email: f.email }));
    } else {
      const a = savedAddresses.find((x) => x.id === id);
      if (a) {
        setForm((f) => ({
          ...f,
          firstName: a.name?.split(" ")[0] || f.firstName,
          lastName: a.name?.split(" ").slice(1).join(" ") || f.lastName,
          email: a.email || f.email,
          phone: a.phone ?? "",
          streetAddress: a.streetAddress,
          apartment: a.apartment || "",
          city: a.city,
          state: a.state,
          postalCode: a.postalCode,
        }));
      }
    }
  }

  const fieldErrors = validateDelivery(form, !authUser);
  const billingErrors = validateBilling(billing);
  const shippingResolved = shipping.status === "quotes" || shipping.status === "free";
  const subtotal = (lines ?? []).reduce((s, it) => s + (it.variant?.price ?? it.product.price) * it.quantity, 0);
  const shipOptions = shipping.status === "quotes" ? shipping.options : null;
  const selectedOption = shipOptions?.find((o) => o.method === shipMode) ?? null;
  const shippingAmount = selectedOption ? selectedOption.amountPaise : shipping.status === "free" ? 0 : null;
  const discount = coupon?.discount ?? 0;
  const total = shippingAmount == null ? null : subtotal + shippingAmount - discount;
  const formValid = Object.keys(fieldErrors).length === 0 && (billingSame || Object.keys(billingErrors).length === 0);
  const canPlace = !!lines && lines.length > 0 && authChecked && shippingResolved && formValid && !placing;

  async function placeOrder() {
    setShowErrors(true);
    setError(null);
    if (!canPlace) return;
    setPlacing(true);
    try {
      const res = await fetch("/api/payments/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingAddress: {
            firstName: form.firstName.trim(),
            lastName: form.lastName.trim(),
            streetAddress: form.streetAddress.trim(),
            apartment: form.apartment.trim() || undefined,
            city: form.city.trim(),
            state: form.state.trim(),
            postalCode: form.postalCode.trim(),
            phone: form.phone.trim(),
          },
          email: authUser ? undefined : form.email.trim(),
          saveAddress: Boolean(authUser) && selectedAddressId === "new" && saveAddress,
          mode: shipMode,
          couponCode: coupon?.code ?? undefined,
          billingSameAsShipping: billingSame,
          ...(billingSame
            ? {}
            : {
                billingAddress: {
                  fullName: billing.fullName.trim(),
                  addressLine1: billing.addressLine1.trim(),
                  addressLine2: billing.addressLine2.trim() || undefined,
                  city: billing.city.trim(),
                  state: billing.state.trim(),
                  pinCode: billing.pinCode.trim(),
                  phone: billing.phone.trim(),
                },
              }),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create your order. Please try again.");
        setPlacing(false);
        return;
      }
      launchRazorpayPayment({
        order: data,
        description: `Order ${data.orderNumber}`,
        prefill: {
          name: `${form.firstName} ${form.lastName}`.trim(),
          email: data.customerEmail ?? form.email,
          contact: form.phone,
        },
        onVerified: () => {
          void (async () => {
            try {
              await fetch("/api/cart", { method: "DELETE" });
            } catch {
              /* order already recorded; cart clearing is best-effort */
            }
            router.push(`/order/success/${data.orderNumber}`);
          })();
        },
        onDismissed: () => {
          setError("Payment was cancelled. You have not been charged.");
          setPlacing(false);
        },
        onError: (msg) => {
          setError(msg);
          setPlacing(false);
        },
      });
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
      setPlacing(false);
    }
  }

  const addrCardClass = (active: boolean) =>
    `flex items-start gap-3 p-3 rounded-md cursor-pointer border transition-colors ${
      active ? "border-[var(--acc)] bg-[var(--acc-dim)]" : "border-transparent bg-[var(--bg2)] hover:border-[var(--line)]"
    }`;

  if (lines === null) {
    return (
      <main className="checkout-page">
        <div className="wrap pt-8 pb-16" style={{ textAlign: "center" }}>
          <div className="skeleton h-4 w-48 mx-auto mb-8" style={{ borderRadius: "var(--r-sm)" }} />
          <div className="skeleton h-64 w-full max-w-3xl mx-auto" style={{ borderRadius: "var(--r-lg)" }} />
        </div>
      </main>
    );
  }

  if (lines.length === 0) {
    return (
      <main className="checkout-page">
        <section className="svc-section">
          <div className="wrap">
            <p className="sec-num">{"// CHECKOUT"}</p>
            <h1 className="sec-title font-display mb-2">Complete Your Order</h1>
            <div className="card qcard p-10 text-center mt-8">
              <p className="ct mb-2">Your cart is empty</p>
              <p className="text-sm text-[var(--t3)] mb-2">Looks like you haven&apos;t added anything yet.</p>
              <Link href="/shop" className="btn-prime" style={{ width: "auto", paddingInline: 24, marginTop: 16 }}>
                Browse Shop
              </Link>
            </div>
            <div className="pb-8 text-center mt-6">
              <button type="button" className="btn-ghost" onClick={() => router.push("/mods")}>
                Looking for a service build? Configure one here →
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="checkout-page">
      <RazorpayScript />
      <section className="svc-section">
        <div className="wrap">
          <p className="panel-tag">CHECKOUT</p>
          <h1 className="sec-title font-display">Review &amp; Pay</h1>
          <p className="sec-desc text-[var(--t3)]">
            Review your items, enter delivery details and pay securely.
          </p>

          {error && (
            <div className="card p-4 mb-6 border border-[var(--err)]" role="alert">
              <p className="text-sm text-[var(--err)]">{error}</p>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
            {/* ── Left column: stepped form ── */}
            <div className="flex flex-col gap-4">

              {/* ── 01 · Customer Details ── */}
              <section className="card">
                <p className="panel-tag">STEP 01</p>
                <h2 className="panel-title">Customer Details</h2>
                {!authUser && authChecked && (
                  <p className="text-sm text-[var(--t3)] mb-3">Checking out as guest.</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="First Name *" error={showErrors ? fieldErrors.firstName : undefined}>
                    <input
                      className={fieldClass(showErrors && !!fieldErrors.firstName)}
                      value={form.firstName}
                      onChange={setField("firstName")}
                      autoComplete="given-name"
                    />
                  </Field>
                  <Field label="Last Name *" error={showErrors ? fieldErrors.lastName : undefined}>
                    <input
                      className={fieldClass(showErrors && !!fieldErrors.lastName)}
                      value={form.lastName}
                      onChange={setField("lastName")}
                      autoComplete="family-name"
                    />
                  </Field>
                  {authUser ? (
                    <Field label="Email" error={showErrors ? fieldErrors.email : undefined}>
                      <input className={`${fieldClass(false)} opacity-60`} value={authUser.email} disabled readOnly />
                    </Field>
                  ) : (
                    <Field label="Email *" error={showErrors ? fieldErrors.email : undefined}>
                      <input
                        type="email"
                        className={fieldClass(showErrors && !!fieldErrors.email)}
                        value={form.email}
                        onChange={setField("email")}
                        autoComplete="email"
                      />
                    </Field>
                  )}
                  <Field label="Phone *" error={showErrors ? fieldErrors.phone : undefined}>
                    <input
                      inputMode="tel"
                      className={fieldClass(showErrors && !!fieldErrors.phone)}
                      value={form.phone}
                      onChange={setField("phone")}
                      autoComplete="tel"
                    />
                  </Field>
                </div>
              </section>

              {/* ── 02 · Shipping Address ── */}
              <section className="card">
                <div className="flex items-baseline justify-between">
                  <div>
                    <p className="panel-tag">STEP 02</p>
                    <h2 className="panel-title" style={{ marginBottom: 0 }}>Shipping Address</h2>
                  </div>
                  {savedAddresses.length > 0 && (
                    <span className="text-[0.65rem] uppercase tracking-[0.06em] text-[var(--t3)]">
                      {savedAddresses.length} saved
                    </span>
                  )}
                </div>
                {authUser && savedAddresses.length > 0 && (
                  <div className="flex flex-col gap-2 mt-4">
                    {savedAddresses.map((a) => (
                      <label key={a.id} className={addrCardClass(selectedAddressId === a.id)}>
                        <input
                          type="radio"
                          name="saved-address"
                          checked={selectedAddressId === a.id}
                          onChange={() => pickAddress(a.id)}
                          className="mt-1 accent-[var(--acc)]"
                        />
                        <span>
                          <span className="ct block">
                            {a.label}
                            {a.isDefault ? " · Default" : ""}
                          </span>
                          <span className="text-sm text-[var(--t3)]">
                            {a.streetAddress}, {a.city}, {a.state} {a.postalCode}
                          </span>
                        </span>
                      </label>
                    ))}
                    <label className={addrCardClass(selectedAddressId === "new")}>
                      <input
                        type="radio"
                        name="saved-address"
                        checked={selectedAddressId === "new"}
                        onChange={() => pickAddress("new")}
                        className="mt-1 accent-[var(--acc)]"
                      />
                      <span className="ct">Use a different address</span>
                    </label>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2 mt-4">
                  <div className="sm:col-span-2">
                    <Field label="Street Address *" error={showErrors ? fieldErrors.streetAddress : undefined}>
                      <input
                        className={fieldClass(showErrors && !!fieldErrors.streetAddress)}
                        value={form.streetAddress}
                        onChange={setField("streetAddress")}
                        autoComplete="address-line1"
                        placeholder="House / flat no., building, street"
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2">
                    <Field label="Apartment, Suite, etc.">
                      <input
                        className={fieldClass(false)}
                        value={form.apartment}
                        onChange={setField("apartment")}
                        autoComplete="address-line2"
                        placeholder="Optional"
                      />
                    </Field>
                  </div>
                  <div className="sm:col-span-2 addr-city-row">
                    <Field label="City *" error={showErrors ? fieldErrors.city : undefined}>
                      <input
                        className={fieldClass(showErrors && !!fieldErrors.city)}
                        value={form.city}
                        onChange={setField("city")}
                        autoComplete="address-level2"
                      />
                    </Field>
                    <Field label="State *" error={showErrors ? fieldErrors.state : undefined}>
                      <select
                        className={`shop-select w-full${showErrors && fieldErrors.state ? " error" : ""}`}
                        value={form.state}
                        onChange={setField("state")}
                        autoComplete="address-level1"
                      >
                        <option value="">Select State</option>
                        {INDIAN_STATES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="PIN Code *" error={showErrors ? fieldErrors.postalCode : undefined}>
                      <input
                        inputMode="numeric"
                        maxLength={6}
                        className={fieldClass(showErrors && !!fieldErrors.postalCode)}
                        value={form.postalCode}
                        onChange={setField("postalCode")}
                        autoComplete="postal-code"
                      />
                    </Field>
                  </div>
                </div>
                {authUser && selectedAddressId === "new" && (
                  <label className="flex items-center gap-2 mt-4 text-sm text-[var(--t2)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAddress}
                      onChange={(e) => setSaveAddress(e.target.checked)}
                      className="accent-[var(--acc)]"
                    />
                    Save this address to my account
                  </label>
                )}
              </section>

              {/* ── 03 · Payment ── */}
              <section className="card">
                <p className="panel-tag">STEP 03</p>
                <h2 className="panel-title" style={{ marginBottom: 12 }}>Payment</h2>
                <p className="text-sm text-[var(--t3)]">All transactions are secure and encrypted.</p>
                <label
                  className="block rounded-lg border border-[var(--acc)] bg-[var(--bg2)] p-4 cursor-pointer mt-3"
                  style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--acc) 35%, transparent)" }}
                >
                  <span className="flex items-start gap-3">
                    <input type="radio" name="paymentMethod" checked readOnly className="mt-1 shrink-0" style={{ accentColor: "var(--acc)" }} aria-label="Razorpay payment gateway" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-3 flex-wrap">
                        <span>
                          <span className="font-display font-bold text-sm text-[var(--t1)] block">Razorpay Payment Gateway</span>
                          <span className="text-xs text-[var(--t3)]">UPI, Cards, International Cards, Wallets</span>
                        </span>
                        <span className="flex items-center gap-1.5 flex-wrap" aria-hidden="true">
                          <span className="text-[0.65rem] font-bold tracking-wide px-2 py-1 rounded border border-[var(--bdr)] bg-[var(--bg1)] text-[var(--t2)]">UPI</span>
                          <span className="text-[0.65rem] font-bold italic tracking-wide px-2 py-1 rounded border border-[var(--bdr)] bg-[var(--bg1)] text-[var(--t2)]">VISA</span>
                          <span className="flex items-center px-2 py-1 rounded border border-[var(--bdr)] bg-[var(--bg1)]">
                            <span className="inline-block w-3 h-3 rounded-full opacity-90" style={{ background: "#EB001B" }} />
                            <span className="inline-block w-3 h-3 rounded-full opacity-90 -ml-1.5" style={{ background: "#F79E1B" }} />
                          </span>
                          <span className="text-[0.65rem] font-medium px-2 py-1 rounded border border-[var(--bdr)] bg-[var(--bg1)] text-[var(--t3)]">+more</span>
                        </span>
                      </span>
                      <span className="block text-xs text-[var(--t3)] mt-2.5">
                        You&apos;ll be redirected to Razorpay&apos;s secure checkout to complete your purchase.
                      </span>
                    </span>
                  </span>
                </label>
              </section>

              {/* ── 05 · Billing Address ── */}
              <section className="card">
                <p className="panel-tag">STEP 04</p>
                <h2 className="panel-title" style={{ marginBottom: 16 }}>Billing Address</h2>
                <div className="grid gap-2">
                  {(
                    [
                      { same: true, label: "Same as shipping address" },
                      { same: false, label: "Use a different billing address" },
                    ] as const
                  ).map((opt) => (
                    <label
                      key={opt.label}
                      className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${billingSame === opt.same ? "border-[var(--acc)] bg-[var(--bg2)]" : "border-[var(--bdr)] hover:border-[var(--t3)]"}`}
                    >
                      <input type="radio" name="billingOption" checked={billingSame === opt.same} onChange={() => setBillingSame(opt.same)} className="shrink-0" style={{ accentColor: "var(--acc)" }} />
                      <span className={`text-sm ${billingSame === opt.same ? "font-medium text-[var(--t1)]" : "text-[var(--t2)]"}`}>{opt.label}</span>
                    </label>
                  ))}
                </div>
                {!billingSame && (
                  <div className="grid gap-3 mt-4">
                    <Field label="Full Name *" error={showErrors ? billingErrors.fullName : undefined}>
                      <input type="text" className={fieldClass(!!(showErrors && billingErrors.fullName))} value={billing.fullName} onChange={setBillingField("fullName")} placeholder="Name on the bill" autoComplete="billing name" />
                    </Field>
                    <Field label="Address Line 1 *" error={showErrors ? billingErrors.addressLine1 : undefined}>
                      <input type="text" className={fieldClass(!!(showErrors && billingErrors.addressLine1))} value={billing.addressLine1} onChange={setBillingField("addressLine1")} placeholder="House/Flat/Building, Street, Area" autoComplete="billing address-line1" />
                    </Field>
                    <Field label="Address Line 2 (Optional)">
                      <input type="text" className="shop-field w-full" value={billing.addressLine2} onChange={setBillingField("addressLine2")} placeholder="Landmark (optional)" autoComplete="billing address-line2" />
                    </Field>
                    <div className="addr-city-row">
                      <Field label="City *" error={showErrors ? billingErrors.city : undefined}>
                        <input type="text" className={fieldClass(!!(showErrors && billingErrors.city))} value={billing.city} onChange={setBillingField("city")} placeholder="City" autoComplete="billing address-level2" />
                      </Field>
                      <Field label="State *" error={showErrors ? billingErrors.state : undefined}>
                        <select
                          className={`shop-select w-full${showErrors && billingErrors.state ? " error" : ""}`}
                          value={billing.state}
                          onChange={setBillingField("state")}
                          autoComplete="billing address-level1"
                        >
                          <option value="">Select State</option>
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="PIN Code *" error={showErrors ? billingErrors.pinCode : undefined}>
                        <input type="text" inputMode="numeric" maxLength={6} className={fieldClass(!!(showErrors && billingErrors.pinCode))} value={billing.pinCode} onChange={setBillingField("pinCode")} placeholder="110001" autoComplete="billing postal-code" />
                      </Field>
                    </div>
                    <Field label="Phone *" error={showErrors ? billingErrors.phone : undefined}>
                      <input type="tel" className={fieldClass(!!(showErrors && billingErrors.phone))} value={billing.phone} onChange={setBillingField("phone")} placeholder="+91 98765 43210" autoComplete="billing tel" />
                    </Field>
                  </div>
                )}
              </section>
            </div>

            {/* ── Right column: sticky summary ── */}
            <aside className="card checkout-summary">
              <h2 className="panel-title" style={{ marginBottom: 16 }}>Order Summary</h2>
              <div className="flex flex-col gap-3 mb-4 pb-4 border-b border-[var(--bdr)]">
                {lines.map((it) => {
                  const unit = it.variant?.price ?? it.product.price;
                  const configLine =
                    it.config?.kind === "options" && it.config.selections?.length
                      ? it.config.selections.map((sel) => sel.optionName).filter(Boolean).join(" · ")
                      : it.variant?.name;
                  return (
                    <div key={it.id} className="flex items-center gap-3">
                      {it.product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.product.image} alt="" className="w-12 h-12 rounded object-cover border border-[var(--bdr)]" />
                      ) : (
                        <div className="w-12 h-12 rounded bg-[var(--bg2)] border border-[var(--bdr)] flex items-center justify-center text-lg">
                          ⌨️
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-[var(--t1)] truncate">{it.product.name}</p>
                        <p className="text-xs text-[var(--t3)] truncate">
                          {configLine ? `${configLine} · ` : ""}Qty {it.quantity}
                        </p>
                      </div>
                      <span className="font-display font-bold text-sm text-[var(--t1)] whitespace-nowrap">
                        {formatINR(unit * it.quantity)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="pt-0.5 space-y-1.5">
                <CouponPanel subtotalPaise={subtotal} coupon={coupon} setCoupon={setCoupon} />
                <div className="border-t border-[var(--bdr)] pt-5 space-y-1.5">
                  <Row label="Subtotal" value={formatINR(subtotal)} />
                  {coupon && (
                    <Row label="Discount" value={<span className="text-[var(--acc)]">−{formatINR(coupon.discount)}</span>} />
                  )}
                  <Row
                    label="Shipping"
                    value={
                      shipping.status === "free" ? (
                        <span className="text-[var(--acc)] font-bold">FREE</span>
                      ) : selectedOption ? (
                        formatINR(selectedOption.amountPaise)
                      ) : shipping.status === "calculating" ? (
                        "…"
                      ) : (
                        "—"
                      )
                    }
                  />
                  <div className="border-t border-[var(--bdr)] my-3 pt-3">
                    <div className="flex justify-between font-display font-bold text-[var(--t1)]">
                      <span>Total</span>
                      <span>{total == null ? "—" : formatINR(total)}</span>
                    </div>
                  </div>
                </div>
              </div>
              <AffordabilityWidget amountPaise={total} keyId={razorpayKeyId} />
              <button
                type="button"
                className="btn-prime w-full justify-center mt-4"
                disabled={!canPlace}
                onClick={() => void placeOrder()}
              >
                {placing
                  ? "Processing…"
                  : shipping.status === "calculating"
                    ? "Calculating shipping…"
                    : total != null && formValid
                      ? `Pay ${formatINR(total)}`
                      : "Complete delivery details"}
              </button>
              {!authUser && authChecked && (
                <p className="text-xs text-[var(--t3)] mt-2 text-center">You&apos;ll receive order updates at your email.</p>
              )}
              <Link href="/shop/cart" className="btn-ghost w-full mt-2 justify-center">
                Back to Cart
              </Link>
            </aside>
          </div>
        </div>
      </section>
      <div className="pb-8 text-center wrap">
        <button type="button" className="btn-ghost" onClick={() => router.push("/mods")}>
          Looking for a service build? Configure one here →
        </button>
      </div>
    </main>
  );
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[0.75rem] font-semibold tracking-[0.02em] uppercase text-[var(--t2)] block mb-1">{label}</label>
      {children}
      {error && <p className="text-sm text-[var(--err)] mt-1" role="alert">{error}</p>}
    </div>
  );
}

function Row({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex justify-between text-sm text-[var(--t3)]">
      <span>{label}</span>
      <span className="text-[var(--t1)]">{value}</span>
    </div>
  );
}

function fieldClass(hasError: boolean) {
  return `shop-field w-full${hasError ? " error" : ""}`;
}

function validateBilling(b: BillingAddress): Partial<Record<keyof BillingAddress, string>> {
  const errors: Partial<Record<keyof BillingAddress, string>> = {};
  if (!b.fullName.trim()) errors.fullName = "Full name is required";
  if (!b.addressLine1.trim()) errors.addressLine1 = "Address is required";
  if (!b.city.trim()) errors.city = "City is required";
  if (!b.state.trim()) errors.state = "State is required";
  if (!b.pinCode.trim()) errors.pinCode = "PIN code is required";
  else if (!/^\d{6}$/.test(b.pinCode.trim())) errors.pinCode = "Enter a valid 6-digit PIN code";
  if (!b.phone.trim()) errors.phone = "Phone number is required";
  else if (!/^[+\d][\d\s-]{5,18}$/.test(b.phone.trim())) errors.phone = "Enter a valid phone number";
  return errors;
}

function validateForm(f: FormData): Partial<Record<keyof FormData, string>> {
  const errors: Partial<Record<keyof FormData, string>> = {};
  if (!f.firstName.trim()) errors.firstName = "First name is required";
  if (!f.lastName.trim()) errors.lastName = "Last name is required";
  if (!f.email.trim()) errors.email = "Email is required";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) errors.email = "Enter a valid email";
  if (!f.phone.trim()) errors.phone = "Phone number is required";
  else if (!/^[+\d][\d\s-]{5,18}$/.test(f.phone.trim())) errors.phone = "Enter a valid phone number";
  if (!f.streetAddress.trim()) errors.streetAddress = "Address is required";
  if (!f.city.trim()) errors.city = "City is required";
  if (!f.state.trim()) errors.state = "State is required";
  if (!f.postalCode.trim()) errors.postalCode = "PIN code is required";
  else if (!/^\d{6}$/.test(f.postalCode.trim())) errors.postalCode = "Enter a valid 6-digit PIN code";
  return errors;
}
