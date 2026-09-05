import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth/admin";
import { formatINR } from "@/lib/money";
import { ORDER_STATUS_LABELS, ORDER_STATUS_CHIP, ORDER_STATUS_STAGES, ORDER_TYPE_LABELS } from "@/lib/orders";
import { getAdminOrder } from "@/lib/admin";
import { fmtIST } from "@/lib/ist";
import { OrderHeaderActions } from "@/components/admin/orders/OrderHeaderActions";
import { FinancialPanel } from "@/components/admin/orders/FinancialPanel";
import { OrderTimelineAdd } from "@/components/admin/orders/OrderTimelineAdd";
import { OrderNoteAdd } from "@/components/admin/orders/OrderNoteAdd";
import { ShippingPanel } from "@/components/admin/orders/ShippingPanel";
import { DeleteOrderForm } from "@/components/admin/orders/DeleteOrderForm";
import { OrderAddressForm } from "@/components/admin/orders/OrderAddressForm";

export const metadata: Metadata = {
  title: "Order | KeebForge Admin",
  robots: { index: false, follow: false },
};

const DEVICE_LABEL: Record<string, string> = { KEYBOARD: "Keyboard", MOUSE: "Mouse", OTHER: "Other" };

function statusBadge(status: OrderStatus): string {
  const c = ORDER_STATUS_CHIP[status];
  if (c === "status-success") return "badge-ok";
  if (c === "status-warning") return "badge-warn";
  return "";
}

function payBadge(p: PaymentStatus): string {
  if (p === "PAID") return "badge-ok";
  if (p === "FAILED" || p === "REFUNDED") return "badge-err";
  return "badge-warn";
}

/** One-line summary of what this order is, derived from the stored data. */
function orderSubtitle(order: {
  type: string;
  summary: unknown;
  repairs: { deviceType: string }[];
}): string {
  const s = (order.summary ?? {}) as Record<string, unknown>;
  const devKey = typeof s.deviceType === "string" ? s.deviceType : order.repairs[0]?.deviceType;
  const device = (DEVICE_LABEL[devKey] ?? "").toLowerCase();
  switch (order.type) {
    case "REPAIR": {
      const serviceType = typeof s.serviceType === "string" ? s.serviceType : "";
      const prefix =
        serviceType === "custom" ? "Custom" : serviceType && serviceType !== "repair" ? serviceType.charAt(0).toUpperCase() + serviceType.slice(1) : "";
      return [prefix, device && "repair" ? `${device} repair` : null].filter(Boolean).join(" ") || "Repair order";
    }
    case "SERVICE":
      return device ? `${device} modification` : "Modification order";
    case "COMBINED":
      return "Bundle order";
    default:
      return "Product order";
  }
}

/** Safe reader for the SERVICE order device snapshot stored in Order.summary. */
function serviceDeviceRows(summary: unknown): Array<[string, string]> {
  if (!summary || typeof summary !== "object") return [];
  const s = summary as Record<string, unknown>;
  if (s.deviceType !== "KEYBOARD" && s.deviceType !== "MOUSE") return [];
  const rows: Array<[string, string]> = [
    ["Type", s.deviceType === "KEYBOARD" ? "Keyboard" : "Mouse"],
    ["Brand / Model", [s.brand, s.model].filter((v) => typeof v === "string" && v).join(" ") || "—"],
  ];
  if (typeof s.layout === "string" && s.layout) rows.push(["Layout", s.layout]);
  if (typeof s.switchModel === "string" && s.switchModel) rows.push(["Switch model", s.switchModel]);
  if (typeof s.switchQuantity === "number") rows.push(["Switches", String(s.switchQuantity)]);
  if (typeof s.stabilizerQuantity === "number" && s.stabilizerQuantity > 0) rows.push(["Stabilizers", String(s.stabilizerQuantity)]);
  rows.push(["Keycaps", s.keycapsIncluded ? "Included" : "Not Included"]);
  return rows;
}

function isQuoteOrder(summary: unknown): boolean {
  return Boolean(summary && typeof summary === "object" && (summary as { hasQuotes?: unknown }).hasQuotes === true);
}

function isQuoteService(summary: unknown, slug: string): boolean {
  if (!summary || typeof summary === "object") {
    const lines = (summary as { services?: Array<{ slug?: unknown; isQuote?: unknown }> } | null)?.services;
    if (Array.isArray(lines)) {
      return lines.some((l) => l?.slug === slug && l.isQuote === true);
    }
  }
  return false;
}

/** Parses a Repair's `notes` JSON blob into a workable object (best-effort). */
function repairNotes(notes: string | null): {
  serviceType?: string;
  workTypes?: string[];
  condition?: string | null;
  budget?: string | null;
} {
  if (!notes) return {};
  try {
    const o = JSON.parse(notes) as Record<string, unknown>;
    return {
      serviceType: typeof o.serviceType === "string" ? o.serviceType : undefined,
      workTypes: Array.isArray(o.workTypes) ? o.workTypes.filter((w): w is string => typeof w === "string") : undefined,
      condition: typeof o.condition === "string" ? o.condition : null,
      budget: typeof o.budget === "string" ? o.budget : null,
    };
  } catch {
    return {};
  }
}

function OverviewCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="admin-card">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

export default async function AdminOrderDetail({ params }: { params: Promise<{ orderNumber: string }> }) {
  await requirePermission("order", "view");
  const { orderNumber } = await params;
  const order = await getAdminOrder(orderNumber);
  if (!order) notFound();

  const statuses = (Object.entries(ORDER_STATUS_LABELS) as [string, string][]).map(([value, label]) => ({
    value: value as OrderStatus,
    label,
  }));
  const payTotal = order.payments.reduce((s, p) => s + p.amount, 0);
  const configured = order.total > 0 || payTotal > 0;
  const fullyPaid = order.paymentStatus === "PAID";
  const balance = Math.max(0, order.total - payTotal);
  const hasLines = order.items.length > 0 || order.services.length > 0 || order.repairs.length > 0;
  const stage = ORDER_STATUS_STAGES[order.status];

  const customerHref = order.profile
    ? "/admin/customers"
    : `/admin/orders?q=${encodeURIComponent(order.customerEmail)}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ── 1. Order header ─────────────────────────────────────────────── */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <Link href="/admin/orders" className="muted" style={{ fontSize: "0.75rem" }}>
              ← Orders
            </Link>
            <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "-0.02em", margin: "4px 0 2px" }}>
              {order.orderNumber}
            </h1>
            <div style={{ fontSize: "0.9rem", color: "var(--t2)", fontWeight: 600 }}>{orderSubtitle(order)}</div>
            <div className="muted" style={{ marginTop: 4 }}>
              {order.customerName} · <a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a> ·{" "}
              <span className="num">{order.customerPhone ?? "no phone"}</span>
              <span style={{ opacity: 0.7 }}>
                {" "}
                · placed {fmtIST(order.createdAt, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            <div className="admin-actions" style={{ justifyContent: "flex-end" }}>
              <span className="badge badge-purple">{ORDER_TYPE_LABELS[order.type].toUpperCase()}</span>
              <span className={`badge ${statusBadge(order.status)}`}>{ORDER_STATUS_LABELS[order.status].toUpperCase()}</span>
            </div>
            <OrderHeaderActions orderId={order.id} currentStatus={order.status} statuses={statuses} />
          </div>
        </div>
      </section>

      {/* ── 2. Customer / Order / Payment overview ─────────────────────── */}
      <div className="admin-grid cols-3" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        <OverviewCard title="Customer">
          <dl className="pill-grid">
            <div className="kv">
              <dt>Name</dt>
              <dd>{order.customerName}</dd>
            </div>
            <div className="kv">
              <dt>Email</dt>
              <dd style={{ wordBreak: "break-all" }}>{order.customerEmail}</dd>
            </div>
            <div className="kv">
              <dt>Phone</dt>
              <dd className="num">{order.customerPhone ?? "—"}</dd>
            </div>
            <div className="kv">
              <dt>Account</dt>
              <dd>{order.profile ? order.profile.email : "Guest"}</dd>
            </div>
          </dl>
          <Link href={customerHref} className="btn-admin sm" style={{ marginTop: 8 }}>
            View customer
          </Link>
        </OverviewCard>

        <OverviewCard title="Order">
          <dl className="pill-grid">
            <div className="kv">
              <dt>Type</dt>
              <dd>{ORDER_TYPE_LABELS[order.type]}</dd>
            </div>
            <div className="kv">
              <dt>Status</dt>
              <dd>
                <span className={`badge ${statusBadge(order.status)}`}>{ORDER_STATUS_LABELS[order.status]}</span>
              </dd>
            </div>
            <div className="kv">
              <dt>Created</dt>
              <dd className="num" style={{ fontSize: "0.78rem" }}>
                {fmtIST(order.createdAt, { day: "2-digit", month: "short", year: "numeric" })}
              </dd>
            </div>
            {order.warranty && (
              <div className="kv">
                <dt>Warranty</dt>
                <dd className="num" style={{ fontSize: "0.78rem" }}>
                  {order.warranty.status} · {fmtIST(order.warranty.endDate, { day: "2-digit", month: "short", year: "numeric" })}
                </dd>
              </div>
            )}
          </dl>
          <div style={{ marginTop: 8 }}>
            <div style={{ height: 4, background: "var(--bg3)", borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${stage}%`, background: "var(--acc)" }} />
            </div>
            <div className="muted" style={{ marginTop: 4 }}>
              Stage {stage}% of order flow
            </div>
          </div>
        </OverviewCard>

        <OverviewCard title="Payment">
          <dl className="pill-grid">
            <div className="kv">
              <dt>Total</dt>
              <dd className="num" style={{ fontWeight: 700 }}>
                {formatINR(order.total)}
              </dd>
            </div>
            <div className="kv">
              <dt>Status</dt>
              <dd>
                <span className={`badge ${payBadge(order.paymentStatus)}`}>{order.paymentStatus.replace(/_/g, " ")}</span>
              </dd>
            </div>
            <div className="kv">
              <dt>Paid</dt>
              <dd className="num">{formatINR(payTotal)}</dd>
            </div>
            {configured && (
              <div className="kv">
                <dt>Balance due</dt>
                <dd className="num" style={{ color: balance > 0 ? "var(--warn)" : "var(--ok)" }}>
                  {formatINR(balance)}
                </dd>
              </div>
            )}
          </dl>
          <div style={{ marginTop: 8 }}>
            {!configured ? (
              <a href="#financial" className="btn-admin sm primary">
                Set amount
              </a>
            ) : fullyPaid ? (
              <span className="badge badge-ok">✓ Paid {formatINR(payTotal)}</span>
            ) : (
              <a href="#financial" className="btn-admin sm primary">
                Record payment
              </a>
            )}
          </div>
        </OverviewCard>
      </div>

      {/* ── 3. Items / work ────────────────────────────────────────────── */}
      <div className="admin-card" id="items">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <h3 style={{ marginBottom: 0 }}>Items &amp; work</h3>
          <span className="muted num">
            Total <b style={{ fontSize: "0.95rem", color: "var(--t1)" }}>{formatINR(order.total)}</b>
          </span>
        </div>
        <div style={{ marginTop: 12 }}>
          {!hasLines ? (
            <div style={{ color: "var(--t3)", fontSize: "0.85rem" }}>No line items</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th className="num">Qty</th>
                    <th className="num">Unit</th>
                    <th className="num" style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id}>
                      <td><span className="badge badge-purple">Product</span></td>
                      <td>{i.name}</td>
                      <td className="num">{i.quantity}</td>
                      <td className="num">{formatINR(i.unitPrice)}</td>
                      <td className="num" style={{ textAlign: "right" }}>{formatINR(i.lineTotal)}</td>
                    </tr>
                  ))}
                  {order.services.map((s) => {
                    const quote = s.lineTotal === 0 && isQuoteService(order.summary, s.slug);
                    return (
                      <tr key={s.id}>
                        <td><span className="badge badge-lime">Service</span></td>
                        <td>
                          {s.name}
                          {quote && <span className="badge badge-warn" style={{ marginLeft: 6 }}>QUOTE</span>}
                        </td>
                        <td className="num">{s.quantity}</td>
                        <td className="num">{quote ? "—" : formatINR(s.unitPrice)}</td>
                        <td className="num" style={{ textAlign: "right" }}>
                          {quote ? "pending quote" : formatINR(s.lineTotal)}
                        </td>
                      </tr>
                    );
                  })}
                  {order.repairs.map((r) => (
                    <tr key={r.id}>
                      <td><span className="badge badge-warn">Repair</span></td>
                      <td>
                        {r.deviceModel}
                        <div className="muted" style={{ fontSize: "0.75rem" }}>{DEVICE_LABEL[r.deviceType] ?? r.deviceType}</div>
                      </td>
                      <td className="num">1</td>
                      <td className="num muted">{r.quotePrice !== null ? formatINR(r.quotePrice) : "quote"}</td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {r.quotePrice !== null ? formatINR(r.quotePrice) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Repair / custom-work details */}
        {order.repairs.map((r) => {
          const info = repairNotes(r.notes);
          const summary = (order.summary ?? {}) as Record<string, unknown>;
          const workTypes =
            info.workTypes?.length
              ? info.workTypes
              : Array.isArray(summary.workTypes)
                ? (summary.workTypes as unknown[]).filter((w): w is string => typeof w === "string")
                : [];
          const brand = typeof summary.brand === "string" ? summary.brand : undefined;
          const model = typeof summary.model === "string" ? summary.model : undefined;
          const serviceType = info.serviceType ?? (typeof summary.serviceType === "string" ? summary.serviceType : undefined);
          const condition = info.condition ?? (typeof summary.condition === "string" ? summary.condition : null);
          const budget = info.budget ?? (typeof summary.budget === "string" ? summary.budget : null);
          return (
            <div key={r.id} style={{ borderTop: "1px dashed var(--bdr)", marginTop: 12, paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h3 style={{ margin: 0 }}>Repair details</h3>
                {r.quotePrice !== null ? (
                  <span className="badge badge-ok">Quoted {formatINR(r.quotePrice)}</span>
                ) : (
                  <span className="badge badge-warn">Quote pending</span>
                )}
              </div>
              <dl className="pill-grid" style={{ marginTop: 8 }}>
                <div className="kv">
                  <dt>Device</dt>
                  <dd>
                    {DEVICE_LABEL[r.deviceType] ?? r.deviceType}
                    {brand || model ? <span className="muted"> — {[brand, model].filter(Boolean).join(" ")}</span> : null}
                  </dd>
                </div>
                {serviceType && (
                  <div className="kv"><dt>Service</dt><dd>{serviceType}</dd></div>
                )}
                {workTypes.length > 0 && (
                  <div className="kv" style={{ gridColumn: "1 / -1" }}>
                    <dt>Work required</dt>
                    <dd style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {workTypes.map((w) => (
                        <span key={w} className="badge badge-lime">{w}</span>
                      ))}
                    </dd>
                  </div>
                )}
                {condition && (
                  <div className="kv"><dt>Condition</dt><dd>{condition}</dd></div>
                )}
                {budget && (
                  <div className="kv"><dt>Budget estimate</dt><dd className="num">{budget}</dd></div>
                )}
                {r.diagnosis && (
                  <div className="kv" style={{ gridColumn: "1 / -1" }}>
                    <dt>Diagnosis</dt>
                    <dd style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, textAlign: "right" }}>{r.diagnosis}</dd>
                  </div>
                )}
                <div className="kv" style={{ gridColumn: "1 / -1" }}>
                  <dt>Description</dt>
                  <dd style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, textAlign: "right" }}>{r.issue || "—"}</dd>
                </div>
              </dl>
            </div>
          );
        })}

        {/* Service device configuration */}
        {order.type === "SERVICE" && serviceDeviceRows(order.summary).length > 0 && (
          <div style={{ borderTop: "1px dashed var(--bdr)", marginTop: 12, paddingTop: 12 }}>
            <h3 style={{ marginTop: 0 }}>Device configuration</h3>
            <dl className="pill-grid">
              {serviceDeviceRows(order.summary).map(([k, v]) => (
                <div className="kv" key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
            </dl>
            {isQuoteOrder(order.summary) && (
              <span className="badge badge-warn" style={{ marginTop: 8 }}>
                Contains quote-based services — final pricing after inspection
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── 4. Financial summary ───────────────────────────────────────── */}
      <div className="admin-card" id="financial">
        <h3 style={{ marginBottom: 10 }}>Financial summary</h3>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", justifyContent: "space-between" }}>
          <dl className="pill-grid" style={{ flex: "1 1 240px", minWidth: 220 }}>
            <div className="kv"><dt>Subtotal</dt><dd className="num">{formatINR(order.subtotal)}</dd></div>
            <div className="kv"><dt>Shipping</dt><dd className="num">{formatINR(order.shipping)}</dd></div>
            {order.discount > 0 && (
              <div className="kv"><dt>Discount</dt><dd className="num">−{formatINR(order.discount)}</dd></div>
            )}
            <div className="kv" style={{ borderBottom: "none" }}>
              <dt style={{ color: "var(--t1)", fontWeight: 700 }}>Total</dt>
              <dd className="num" style={{ fontWeight: 800, fontSize: "1.05rem" }}>{formatINR(order.total)}</dd>
            </div>
            <div style={{ borderTop: "1px solid var(--bdr)", margin: "4px 0" }} />
            <div className="kv"><dt>Paid</dt><dd className="num">{formatINR(payTotal)}</dd></div>
            {configured && (
              <div className="kv">
                <dt>Balance</dt>
                <dd className="num" style={{ color: balance > 0 ? "var(--warn)" : "var(--ok)" }}>{formatINR(balance)}</dd>
              </div>
            )}
          </dl>

          <div style={{ flex: "1 1 320px", minWidth: 260 }}>
            {!configured ? (
              <span className="badge badge-warn" style={{ marginBottom: 10 }}>
                Amount not configured yet — quote-based pricing
              </span>
            ) : fullyPaid ? (
              <span className="badge badge-ok" style={{ marginBottom: 10 }}>✓ Paid {formatINR(payTotal)}</span>
            ) : (
              <span className="badge badge-warn" style={{ marginBottom: 10 }}>Balance due {formatINR(balance)}</span>
            )}
            <FinancialPanel
              orderId={order.id}
              subtotal={order.subtotal}
              shipping={order.shipping}
              discount={order.discount}
              total={order.total}
              configured={configured}
              fullyPaid={fullyPaid}
            />

            {order.payments.length > 0 && (
              <div style={{ borderTop: "1px dashed var(--bdr)", marginTop: 14, paddingTop: 10 }}>
                <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>
                  Payments
                </div>
                {order.payments.map((p) => (
                  <div key={p.id} className="kv">
                    <dt>
                      {p.method ?? "—"}
                      <span className="muted num"> · {fmtIST(p.paidAt ?? p.createdAt, { day: "2-digit", month: "short" })}</span>
                    </dt>
                    <dd className="num">
                      {formatINR(p.amount)} <span className={`badge ${payBadge(p.status)}`}>{p.status}</span>
                    </dd>
                  </div>
                ))}
                {order.payments.some((p) => p.razorpayPaymentId) && (
                  <details className="kv" style={{ marginTop: 4 }}>
                    <summary style={{ cursor: "pointer", color: "var(--acc)", fontWeight: 600 }}>Razorpay Details</summary>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8, paddingTop: 8, borderTop: "1px dashed var(--bdr)" }}>
                      {order.payments
                        .filter((p) => p.razorpayPaymentId)
                        .map((p) => (
                          <div key={p.id} style={{ fontSize: "0.75rem", fontFamily: "var(--ff-body)" }}>
                            <div className="flex justify-between">
                              <span className="muted">Payment ID</span>
                              <code style={{ color: "var(--t1)" }}>{p.razorpayPaymentId}</code>
                            </div>
                            <div className="flex justify-between">
                              <span className="muted">Order ID</span>
                              <code style={{ color: "var(--t1)" }}>{p.razorpayOrderId}</code>
                            </div>
                            {p.razorpayCustomerId && (
                              <div className="flex justify-between">
                                <span className="muted">Customer ID</span>
                                <code style={{ color: "var(--t1)" }}>{p.razorpayCustomerId}</code>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="muted">Signature</span>
                              <code style={{ color: "var(--t1)" }}>{p.razorpaySignature ? `${p.razorpaySignature.slice(0, 16)}…` : "—"}</code>
                            </div>
                          </div>
                        ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 5. Timeline + Notes ────────────────────────────────────────── */}
      <div className="admin-grid cols-2" style={{ gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
        <div className="admin-card" id="timeline">
          <h3>Timeline</h3>
          <OrderTimelineAdd orderId={order.id} statuses={statuses} />
          {order.timeline.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>No timeline entries yet — add the first one above.</p>
          ) : (
            <div className="tl" style={{ marginTop: 12 }}>
              {order.timeline.map((t, idx) => {
                const latest = idx === order.timeline.length - 1;
                return (
                  <div key={t.id} className="tl-item">
                    <span className={`badge ${latest ? "badge-lime" : statusBadge(t.status)}`} style={{ marginBottom: 4 }}>
                      {ORDER_STATUS_LABELS[t.status]}
                    </span>
                    {t.note && (
                      <div style={{ fontSize: "0.82rem", color: latest ? "var(--t1)" : "var(--t2)", fontWeight: latest ? 600 : 400 }}>
                        {t.note}
                      </div>
                    )}
                    <div className="muted num" style={{ fontSize: "0.68rem" }}>
                      {fmtIST(t.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="admin-card" id="notes">
          <h3>Internal notes</h3>
          <OrderNoteAdd orderId={order.id} />
          {order.messages.length === 0 ? (
            <p className="muted" style={{ marginTop: 12 }}>No notes yet — record a note above.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
              {order.messages.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--r-sm)",
                    background: "var(--surf)",
                    border: "1px solid var(--bdr)",
                    fontSize: "0.82rem",
                  }}
                >
                  {m.visibleToCustomer && (
                    <span className="badge badge-lime" style={{ marginBottom: 6, display: "inline-flex" }}>
                      Customer-visible
                    </span>
                  )}
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.message}</div>
                  <div className="muted num" style={{ fontSize: "0.68rem", marginTop: 4 }}>
                    {m.author} · {fmtIST(m.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── 6. Delivery / Shipping ─────────────────────────────────────── */}
      <div className="admin-card" id="delivery">
        <h3 style={{ marginBottom: 10 }}>Delivery</h3>
        <ShippingPanel
          orderId={order.id}
          shipment={
            order.shipment
              ? {
                  courier: order.shipment.courier,
                  trackingNumber: order.shipment.trackingNumber,
                  trackingUrl: order.shipment.trackingUrl,
                  status: order.shipment.status,
                }
              : null
          }
          weightGrams={order.shippingWeightGrams}
          shippingMode={order.shippingMode}
          defaults={{
            weightGrams: order.shippingWeightGrams,
            declaredValuePaise: Math.max(
              order.total,
              order.repairs.reduce((s, r) => s + (r.quotePrice ?? 0), 0),
              order.type === "REPAIR" ? Math.max(0, Math.round(Number((order.summary as { budget?: unknown } | null)?.budget ?? 0) * 100) || 0) : 0,
            ),
          }}
          hasAddress={Boolean(order.shippingAddress)}
        />

        <details style={{ borderTop: "1px dashed var(--bdr)", marginTop: 14, paddingTop: 12 }} open={!order.shippingAddress}>
          <summary style={{ cursor: "pointer", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--t3)" }}>
            Shipping address · {order.shippingAddress ? "edit" : "not set"}
          </summary>
          {order.shippingAddress && (
            <div style={{ fontSize: "0.84rem", lineHeight: 1.6, margin: "10px 0" }}>
              <div>{order.shippingAddress.streetAddress}</div>
              {order.shippingAddress.apartment && <div>{order.shippingAddress.apartment}</div>}
              <div>
                {order.shippingAddress.city}, {order.shippingAddress.state} — {order.shippingAddress.postalCode}
              </div>
              <div>{order.shippingAddress.country}</div>
              {order.shippingAddress.phone && <div className="muted num">📞 {order.shippingAddress.phone}</div>}
            </div>
          )}
          <OrderAddressForm
            orderId={order.id}
            address={
              order.shippingAddress
                ? {
                    streetAddress: order.shippingAddress.streetAddress,
                    apartment: order.shippingAddress.apartment,
                    city: order.shippingAddress.city,
                    state: order.shippingAddress.state,
                    postalCode: order.shippingAddress.postalCode,
                    country: order.shippingAddress.country,
                    phone: order.shippingAddress.phone,
                    label: order.shippingAddress.label,
                  }
                : {
                    streetAddress: "",
                    apartment: null,
                    city: "",
                    state: "",
                    postalCode: "",
                    country: "India",
                    phone: null,
                    label: null,
                  }
            }
          />
        </details>
      </div>

      {/* ── 7. Danger zone ─────────────────────────────────────────────── */}
      <div
        id="danger"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          padding: "12px 16px",
          border: "1px dashed rgba(255, 107, 107, 0.35)",
          borderRadius: "var(--r-md)",
        }}
      >
        <div style={{ flex: "1 1 280px", minWidth: 220 }}>
          <div style={{ color: "var(--err)", fontWeight: 700, fontSize: "0.85rem" }}>Danger zone</div>
          <p className="muted" style={{ margin: "2px 0 0" }}>
            Permanently deletes this order and all related records. This cannot be undone.
          </p>
        </div>
        <DeleteOrderForm orderId={order.id} orderNumber={order.orderNumber} />
      </div>
    </div>
  );
}