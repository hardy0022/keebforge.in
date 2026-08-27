"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { submitRepairRequest, type RepairRequestState } from "@/app/actions/repair-request";
import { INDIAN_STATES } from "@/lib/indian-states";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_IMAGES = 4;
const MAX_BYTES = 5 * 1024 * 1024;

export type AddressDTO = {
  id: string;
  label: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault: boolean;
};

const SERVICE_CARDS = [
  { id: "custom", title: "Custom Work", desc: "Build, modify, tune, or customize your keyboard." },
  { id: "repair", title: "Repair", desc: "Diagnose and repair keyboards, mice, PCBs, and electronics." },
  { id: "unsure", title: "Not sure", desc: "Describe the problem and we'll help determine the right service." },
] as const;

type ServiceType = (typeof SERVICE_CARDS)[number]["id"];

const CUSTOM_WORK = [
  "Custom Build", "Switch Modification", "Stabilizer Work", "Lubing", "Soldering",
  "PCB Work", "Firmware", "Case / Plate", "Keycaps", "Full Custom Build", "Other",
];
const REPAIR_WORK = [
  "Not powering on", "Keys not working", "Connection issue", "PCB issue", "Switch issue",
  "RGB issue", "Firmware issue", "Physical damage", "Liquid damage", "Other",
];

const CONDITIONS = ["Working but has issues", "Partially working", "Not powering on", "Cosmetic only", "Brand new (parts only)", "Other"];
const DEVICES = [
  { id: "KEYBOARD", label: "Keyboard" },
  { id: "MOUSE", label: "Mouse" },
  { id: "OTHER", label: "Other Electronics" },
];
const SHIPPING = [
  { id: "SHIP", label: "I'll ship the device" },
  { id: "PICKUP", label: "Need a pickup" },
  { id: "UNSURE", label: "Not sure" },
];

function workOptions(service: ServiceType): string[] {
  const list =
    service === "custom"
      ? CUSTOM_WORK
      : service === "repair"
        ? REPAIR_WORK
        : // unsure: both lists merged, deduped ("Other" appears in each)
          [...new Set([...CUSTOM_WORK.filter((w) => w !== "Full Custom Build"), ...REPAIR_WORK])];
  const sorted = [...list].sort((a, b) => a.localeCompare(b));
  // keep "Other" pinned to the end
  const i = sorted.indexOf("Other");
  return i === -1 ? sorted : [...sorted.slice(0, i), ...sorted.slice(i + 1), "Other"];
}

export function RepairIntake({
  defaults,
  addresses,
}: {
  defaults: { name: string; email: string; phone: string };
  addresses: AddressDTO[];
}) {
  const [state, formAction, pending] = useActionState<RepairRequestState, FormData>(submitRepairRequest, {});
  const [phase, setPhase] = useState<"form" | "review">("form");

  const [serviceType, setServiceType] = useState<ServiceType | null>(null);
  const [deviceType, setDeviceType] = useState("KEYBOARD");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [condition, setCondition] = useState(CONDITIONS[0]);
  const [budget, setBudget] = useState("");
  const [description, setDescription] = useState("");
  const defaultNameParts = defaults.name.trim().split(/\s+/);
  const [firstName, setFirstName] = useState(defaultNameParts[0] ?? "");
  const [lastName, setLastName] = useState(defaultNameParts.slice(1).join(" "));
  const [email, setEmail] = useState(defaults.email);
  const [phone, setPhone] = useState(defaults.phone);
  const [contactNotes, setContactNotes] = useState("");
  const [shippingMethod, setShippingMethod] = useState("SHIP");
  const defaultAddress = addresses.find((a) => a.isDefault) ?? addresses[0] ?? null;
  const [useAddressId, setUseAddressId] = useState(defaultAddress?.id ?? "");
  const [street, setStreet] = useState("");
  const [landmark, setLandmark] = useState("");
  const [city, setCity] = useState("");
  const [state_, setState_] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<File[]>([]);
  const [imgError, setImgError] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [gateError, setGateError] = useState<string | null>(null);

  const setFiles = (files: File[]) => {
    if (inputRef.current) {
      const dt = new DataTransfer();
      files.forEach((f) => dt.items.add(f));
      inputRef.current.files = dt.files;
    }
    setImages(files);
  };

  const handleFiles = (incoming: File[]) => {
    setImgError(null);
    const existing = Array.from(inputRef.current?.files ?? []);
    const seen = new Set(existing.map((f) => `${f.name}:${f.size}:${f.lastModified}`));
    const merged = [...existing];
    let err: string | null = null;
    for (const f of incoming) {
      const key = `${f.name}:${f.size}:${f.lastModified}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!ACCEPT.includes(f.type)) err = err ?? `"${f.name}" isn't a supported image. Use JPG, PNG or WEBP.`;
      else if (f.size > MAX_BYTES) err = err ?? `"${f.name}" is over 5 MB. Compress it and try again.`;
      else merged.push(f);
    }
    if (merged.length > MAX_IMAGES) {
      setFiles(merged.slice(0, MAX_IMAGES));
      setImgError(`You can attach up to ${MAX_IMAGES} photos — extra files were skipped.`);
    } else {
      setFiles(merged);
      setImgError(err);
    }
  };

  const removeImage = (idx: number) => {
    setFiles(Array.from(inputRef.current?.files ?? []).filter((_, i) => i !== idx));
  };

  const toggleWork = (w: string) =>
    setWorkTypes((cur) => (cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w]));

  const missing: string[] = [];
  if (!serviceType) missing.push("a service type");
  if (!brand.trim()) missing.push("the brand");
  if (model.trim().length < 2) missing.push("the model / PCB");
  if (workTypes.length === 0) missing.push("at least one work type");
  if (description.trim().length < 20) missing.push("a description (20+ characters)");
  if (firstName.trim().length < 1 || lastName.trim().length < 1) missing.push("your first and last name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) missing.push("a valid email");
  if (phone.trim().length < 10) missing.push("a valid phone number");
  if (shippingMethod !== "UNSURE" && !useAddressId && (!street.trim() || !city.trim() || !state_.trim() || !/^\d{6}$/.test(postalCode.trim())))
    missing.push("the full pickup address");

  const goReview = () => {
    if (missing.length > 0) {
      setGateError(`Please add ${missing.join(", ")} before continuing.`);
      return;
    }
    setGateError(null);
    setPhase("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (state.ok && state.orderNumber) {
    return (
      <div className="ri-done panel">
        <div className="ri-done-badge" aria-hidden="true">✓</div>
        <h2 className="ri-done-title">Request Received</h2>
        <p className="ri-done-text">
          We&apos;ve received your request. We&apos;ll review the details and get back to you with the next steps.
          Final price will be confirmed after inspection.
        </p>
        <p className="ri-ref">
          Reference <strong>{state.orderNumber}</strong>
        </p>
        <div className="ri-done-actions">
          <Link href={`/order/success/${state.orderNumber}`} className="btn-prime">
            View Request
          </Link>
          <Link href="/" className="btn-ghost">
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const serviceLabel = SERVICE_CARDS.find((s) => s.id === serviceType)?.title ?? "—";
  const deviceLabel = DEVICES.find((d) => d.id === deviceType)?.label ?? "—";
  const shipLabel = SHIPPING.find((s) => s.id === shippingMethod)?.label ?? "—";
  const selectedAddress = addresses.find((a) => a.id === useAddressId) ?? null;

  const summaryRows: Array<[string, string]> = [
    ["Service", serviceLabel],
    ["Device", deviceLabel],
    ["Model", model.trim() ? `${brand} ${model}`.trim() : "—"],
    ["Work", workTypes.length > 0 ? workTypes.join(", ") : "—"],
    ["Photos", images.length > 0 ? `${images.length} attached` : "None"],
  ];

  return (
    <form action={formAction} className="ri-layout">
      <input type="hidden" name="serviceType" value={serviceType ?? ""} />
      <input type="hidden" name="deviceType" value={deviceType} />
      <input type="hidden" name="brand" value={brand} />
      <input type="hidden" name="model" value={model} />
      <input type="hidden" name="firstName" value={firstName} />
      <input type="hidden" name="lastName" value={lastName} />
      {workTypes.map((w) => (
        <input key={w} type="hidden" name="workTypes" value={w} />
      ))}
      <input type="hidden" name="condition" value={condition} />
      <input type="hidden" name="budget" value={budget} />
      <input type="hidden" name="description" value={description} />
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="contactNotes" value={contactNotes} />
      <input type="hidden" name="shippingMethod" value={shippingMethod} />
      <input type="hidden" name="useAddressId" value={useAddressId} />
      <input type="hidden" name="street" value={street} />
      <input type="hidden" name="landmark" value={landmark} />
      <input type="hidden" name="city" value={city} />
      <input type="hidden" name="state" value={state_} />
      <input type="hidden" name="postalCode" value={postalCode} />

      <div className="ri-main">
        {phase === "review" ? (
          <section className="panel ri-review">
            <p className="panel-tag">Final Check</p>
            <h2 className="panel-title">Review Your Request</h2>
            <dl className="ri-review-grid">
              <div><dt>Service type</dt><dd>{serviceLabel}</dd></div>
              <div><dt>Device</dt><dd>{deviceLabel}</dd></div>
              <div><dt>Brand</dt><dd>{brand}</dd></div>
              <div><dt>Model / PCB</dt><dd>{model}</dd></div>
              <div className="ri-span"><dt>Requested work</dt><dd>{workTypes.join(", ")}</dd></div>
              <div className="ri-span"><dt>Description</dt><dd>{description}</dd></div>
              <div><dt>Condition</dt><dd>{condition}</dd></div>
              <div><dt>Budget estimate</dt><dd>{budget.trim() || "—"}</dd></div>
              <div className="ri-span"><dt>Photos</dt><dd>{images.length > 0 ? images.map((f) => f.name).join(", ") : "None attached"}</dd></div>
              <div><dt>Name</dt><dd>{`${firstName} ${lastName}`.trim()}</dd></div>
              <div><dt>Email</dt><dd>{email}</dd></div>
              <div><dt>WhatsApp / Phone</dt><dd>{phone}</dd></div>
              <div><dt>Shipping</dt><dd>{shipLabel}</dd></div>
              {shippingMethod !== "UNSURE" && (
                <div className="ri-span">
                  <dt>{shippingMethod === "SHIP" ? "Shipping address" : "Pickup address"}</dt>
                  <dd>
                    {selectedAddress
                      ? `${selectedAddress.streetAddress}, ${selectedAddress.city}, ${selectedAddress.state} ${selectedAddress.postalCode}`
                      : `${street}${landmark ? `, ${landmark}` : ""}, ${city}, ${state_} ${postalCode}`}
                  </dd>
                </div>
              )}
            </dl>
            {(state.error || gateError) && (
              <p role="alert" className="ri-error">{state.error ?? gateError}</p>
            )}
            <div className="ri-review-actions">
              <button type="button" className="btn-ghost" onClick={() => setPhase("form")}>
                Edit Request
              </button>
            </div>
          </section>
        ) : (
          <>
            {/* 01 — SERVICE */}
            <section className="panel ri-step">
              <p className="panel-tag">01 — Service</p>
              <h2 className="panel-title">What can we help you with?</h2>
              <div className="ri-service-grid">
                {SERVICE_CARDS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    role="radio"
                    aria-checked={serviceType === s.id}
                    className={`ri-service-card${serviceType === s.id ? " selected" : ""}`}
                    onClick={() => {
                      setServiceType(s.id);
                      setWorkTypes([]);
                    }}
                  >
                    <span className="ri-service-title">{s.title}</span>
                    <span className="ri-service-desc">{s.desc}</span>
                  </button>
                ))}
              </div>
            </section>

            {/* 02 — DEVICE */}
            <section className="panel ri-step">
              <p className="panel-tag">02 — Device</p>
              <h2 className="panel-title">Project / Device Details</h2>
              <div className="form-row">
                <label>Device type</label>
                <div className="pill-radio-group">
                  {DEVICES.map((dv) => (
                    <label key={dv.id} className={`pill-radio${deviceType === dv.id ? " selected" : ""}`}>
                      <input type="radio" name="deviceTypeRadio" checked={deviceType === dv.id} onChange={() => setDeviceType(dv.id)} />
                      {dv.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="ri-field-row">
                <div className="form-row">
                  <label htmlFor="ri-brand">Brand</label>
                  <input id="ri-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Keychron, Logitech…" />
                </div>
                <div className="form-row">
                  <label htmlFor="ri-model">Model / PCB</label>
                  <input id="ri-model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. K2, G Pro X, custom PCB rev…" />
                </div>
              </div>
            </section>

            {/* 03 — WORK REQUIRED */}
            <section className="panel ri-step">
              <p className="panel-tag">03 — Work Required</p>
              <h2 className="panel-title">What do you need done?</h2>
              <div className="ri-chip-row">
                {workOptions(serviceType ?? "unsure").map((w) => (
                  <button key={w} type="button" className={`ri-chip${workTypes.includes(w) ? " selected" : ""}`} aria-pressed={workTypes.includes(w)} onClick={() => toggleWork(w)}>
                    {w}
                  </button>
                ))}
              </div>
              <div className="ri-field-row">
                <div className="form-row">
                  <label htmlFor="ri-condition">Current condition</label>
                  <select id="ri-condition" value={condition} onChange={(e) => setCondition(e.target.value)}>
                    {CONDITIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label htmlFor="ri-budget">Estimated budget (optional)</label>
                  <input id="ri-budget" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. ₹2,000–5,000" />
                </div>
              </div>
              <div className="form-row">
                <label htmlFor="ri-desc">Description</label>
                <textarea
                  id="ri-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the job — what's happening, what you want achieved, history of the device…"
                  minLength={20}
                />
              </div>
            </section>

            {/* 04 — PHOTOS */}
            <section className="panel ri-step">
              <p className="panel-tag">04 — Photos</p>
              <h2 className="panel-title">Show us what you&apos;re working with</h2>
              <p className="ri-upload-hint">
                Upload photos of the keyboard, PCB, damage, components, or anything that helps us understand the job.
              </p>
              <label
                className={`upload-zone${dropping ? " dropping" : ""}${pending ? " disabled" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDropping(true); }}
                onDragLeave={() => setDropping(false)}
                onDrop={(e) => { e.preventDefault(); setDropping(false); if (!pending) handleFiles(Array.from(e.dataTransfer.files)); }}
              >
                <input
                  ref={inputRef}
                  name="images"
                  type="file"
                  accept={ACCEPT.join(",")}
                  multiple
                  className="upload-input"
                  disabled={pending}
                  onChange={(e) => handleFiles(Array.from(e.target.files ?? []))}
                />
                <span className="upload-ico" aria-hidden="true">🖼️</span>
                <span className="upload-title">Upload photos</span>
                <span className="upload-sub">Drag &amp; drop images here</span>
                <span className="upload-sub">PNG, JPG, WEBP · Up to {MAX_IMAGES} images</span>
              </label>
              {imgError && <p role="alert" className="upload-error">{imgError}</p>}
              {images.length > 0 && (
                <div className="upload-previews" role="list" aria-label="Selected photos">
                  {images.map((f, i) => (
                    <figure className="upload-thumb" role="listitem" key={`${f.name}:${f.size}:${i}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- blob previews can't use next/image */}
                      <img src={URL.createObjectURL(f)} alt={`Photo ${i + 1}: ${f.name}`} />
                      <button type="button" className="upload-remove" onClick={() => removeImage(i)} aria-label={`Remove image ${i + 1}`}>×</button>
                    </figure>
                  ))}
                </div>
              )}
            </section>

            {/* 05 — YOUR DETAILS */}
            <section className="panel ri-step">
              <p className="panel-tag">05 — Your Details</p>
              <h2 className="panel-title">Your Details</h2>
              <div className="ri-field-row">
                <div className="form-row">
                  <label htmlFor="ri-first-name">First Name</label>
                  <input id="ri-first-name" name="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" placeholder="Your first name" />
                </div>
                <div className="form-row">
                  <label htmlFor="ri-last-name">Last Name</label>
                  <input id="ri-last-name" name="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" placeholder="Your last name" />
                </div>
              </div>
              <div className="ri-field-row">
                <div className="form-row">
                  <label htmlFor="ri-phone">WhatsApp / Phone</label>
                  <input id="ri-phone" name="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" placeholder="+91 9998888000" />
                </div>
                <div className="form-row">
                  <label htmlFor="ri-email">Email</label>
                  <input id="ri-email" name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="your@email.com" />
                </div>
              </div>
              <div className="ri-field-row">
                <div className="form-row">
                  <label htmlFor="ri-notes">Additional contact info (optional)</label>
                  <input id="ri-notes" value={contactNotes} onChange={(e) => setContactNotes(e.target.value)} placeholder="Discord, Telegram, alternate number…" />
                </div>
              </div>
            </section>

            {/* 06 — SHIPPING */}
            <section className="panel ri-step">
              <p className="panel-tag">06 — Shipping</p>
              <h2 className="panel-title">Shipping / Pickup</h2>
              <div className="pill-radio-group ri-shipping-pills">
                {SHIPPING.map((sm) => (
                  <label key={sm.id} className={`pill-radio${shippingMethod === sm.id ? " selected" : ""}`}>
                    <input type="radio" name="shippingRadio" checked={shippingMethod === sm.id} onChange={() => setShippingMethod(sm.id)} />
                    {sm.label}
                  </label>
                ))}
              </div>
              {(shippingMethod === "SHIP" || shippingMethod === "PICKUP") && (
                addresses.length > 0 ? (
                  <div className="ri-address-list">
                    {[...addresses, null].map((a) =>
                      a ? (
                        <label key={a.id} className={`ri-address${useAddressId === a.id ? " selected" : ""}`}>
                          <input type="radio" name="addrPick" checked={useAddressId === a.id} onChange={() => setUseAddressId(a.id)} />
                          <span>
                            <strong>{a.label}{a.isDefault ? " · Default" : ""}</strong>
                            {a.streetAddress}, {a.city}, {a.state} {a.postalCode}
                          </span>
                        </label>
                      ) : (
                        <label key="new" className={`ri-address${useAddressId === "" ? " selected" : ""}`}>
                          <input type="radio" name="addrPick" checked={useAddressId === ""} onChange={() => setUseAddressId("")} />
                          <span><strong>Use a different address</strong></span>
                        </label>
                      )
                    )}
                    {useAddressId === "" && (
                      <div className="ri-address-manual">
                        <div className="form-row">
                          <label htmlFor="ri-street">Street address</label>
                          <input id="ri-street" value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" placeholder="House, street…" />
                        </div>
                        <div className="form-row">
                          <label htmlFor="ri-landmark">Landmark (Optional)</label>
                          <input id="ri-landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Near metro station, opposite park…" />
                        </div>
                        <div className="ri-field-row ri-field-row-3">
                          <div className="form-row">
                            <label htmlFor="ri-city">City</label>
                            <input id="ri-city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
                          </div>
                          <div className="form-row">
                            <label htmlFor="ri-pin">PIN code</label>
                            <input
                              id="ri-pin"
                              value={postalCode}
                              onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                              inputMode="numeric"
                              maxLength={6}
                              autoComplete="postal-code"
                            />
                          </div>
                          <div className="form-row">
                            <label htmlFor="ri-state-in">State</label>
                            <select id="ri-state-in" value={state_} onChange={(e) => setState_(e.target.value)} autoComplete="address-level1">
                              <option value="">Select state…</option>
                              {INDIAN_STATES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ri-address-manual">
                    <div className="form-row">
                      <label htmlFor="ri-street">Street address</label>
                      <input id="ri-street" value={street} onChange={(e) => setStreet(e.target.value)} autoComplete="street-address" placeholder="House, street…" />
                    </div>
                    <div className="form-row">
                      <label htmlFor="ri-landmark">Landmark (Optional)</label>
                      <input id="ri-landmark" value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Near metro station, opposite park…" />
                    </div>
                    <div className="ri-field-row ri-field-row-3">
                      <div className="form-row">
                        <label htmlFor="ri-city">City</label>
                        <input id="ri-city" value={city} onChange={(e) => setCity(e.target.value)} autoComplete="address-level2" />
                      </div>
                      <div className="form-row">
                        <label htmlFor="ri-pin">PIN code</label>
                        <input
                          id="ri-pin"
                          value={postalCode}
                          onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                          inputMode="numeric"
                          maxLength={6}
                          autoComplete="postal-code"
                        />
                      </div>
                      <div className="form-row">
                        <label htmlFor="ri-state-in">State</label>
                        <select id="ri-state-in" value={state_} onChange={(e) => setState_(e.target.value)} autoComplete="address-level1">
                          <option value="">Select state…</option>
                          {INDIAN_STATES.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )
              )}
            </section>
          </>
        )}
      </div>

      <aside className="ri-side">
        <div className="panel ri-summary">
          <p className="panel-tag">Submit Request</p>
          <dl className="ri-summary-list">
            {summaryRows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="ri-quote-note">Final price will be confirmed after inspection.</p>
          {gateError && phase === "form" && <p role="alert" className="ri-error">{gateError}</p>}
          {phase === "form" ? (
            <button type="button" className="btn-form-submit" onClick={goReview} disabled={pending}>
              Review Request
            </button>
          ) : (
            <button type="submit" className="btn-form-submit" disabled={pending}>
              {pending ? "Submitting…" : "Submit Request →"}
            </button>
          )}
          <p className="ri-side-hint">Mail-in service across India · Photos speed up assessment</p>
        </div>
      </aside>
    </form>
  );
}
