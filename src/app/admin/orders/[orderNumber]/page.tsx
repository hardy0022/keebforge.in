import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { formatINR } from "@/lib/money";
import { ORDER_STATUS_LABELS } from "@/lib/orders";
import { getAdminOrder } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { RepairImagesPanel, type RepairImagesRepair } from "@/components/admin/orders/RepairImagesPanel";
import { OrderDetailClient } from "@/components/admin/orders/OrderDetailClient";

export const metadata: Metadata = {
  title: "Order | KeebForge Admin",
  robots: { index: false, follow: false },
};

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

export default async function AdminOrderDetail({ params }: { params: Promise<{ orderNumber: string }> }) {
  await requirePermission("order", "view");
  const { orderNumber } = await params;
  const order = await getAdminOrder(orderNumber);
  if (!order) notFound();

  const statuses = (Object.entries(ORDER_STATUS_LABELS) as [string, string][]).map(([value, label]) => ({
    value: value as never,
    label,
  }));
  const payTotal = order.payments.reduce((s, p) => s + p.amount, 0);

  // Repair photos (customer uploads + admin workflow shots) grouped per repair.
  const repairMedia =
    order.repairs.length > 0
      ? await prisma.media.findMany({
          where: { entityType: "REPAIR", entityId: { in: order.repairs.map((r) => r.id) } },
          select: { id: true, publicId: true, secureUrl: true, role: true, sortOrder: true, entityId: true },
          orderBy: { sortOrder: "asc" },
        })
      : [];
  const repairPanels: RepairImagesRepair[] = order.repairs.map((r) => ({
    id: r.id,
    label: `${r.deviceType} ${r.deviceModel}${r.issue ? ` — ${r.issue}` : ""}`,
    media: repairMedia
      .filter((m) => m.entityId === r.id)
      .map(({ id, publicId, secureUrl, role, sortOrder }) => ({ id, publicId, secureUrl, role, sortOrder })),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <Link href="/admin/orders" className="muted" style={{ fontSize: "0.75rem" }}>
            ← Orders
          </Link>
          <h1 style={{ fontFamily: "var(--ff-display)", fontSize: "1.35rem", fontWeight: 700, letterSpacing: "-0.02em", marginTop: 2 }}>
            {order.orderNumber}
          </h1>
        </div>
        <div className="admin-actions">
          <span className="badge badge-purple">{order.type}</span>
          <span className={`badge ${order.paymentStatus === "PAID" ? "badge-ok" : order.paymentStatus === "FAILED" ? "badge-err" : "badge-warn"}`}>
            {order.paymentStatus}
          </span>
          <span className="badge badge-lime">{ORDER_STATUS_LABELS[order.status]}</span>
        </div>
      </div>

      <div className="admin-grid cols-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        {/* Customer + shipping */}
        <div className="admin-grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div className="admin-card">
            <h3>Customer</h3>
            <dl className="pill-grid">
              <div className="kv">
                <dt>Name</dt>
                <dd>{order.customerName}</dd>
              </div>
              <div className="kv">
                <dt>Email</dt>
                <dd>{order.customerEmail}</dd>
              </div>
              <div className="kv">
                <dt>Phone</dt>
                <dd className="num">{order.customerPhone ?? "—"}</dd>
              </div>
              <div className="kv">
                <dt>Linked account</dt>
                <dd>{order.profile ? order.profile.email : "Guest"}</dd>
              </div>
            </dl>
          </div>

          <div className="admin-card">
            <h3>Shipping address</h3>
            {order.shippingAddress ? (
              <div style={{ fontSize: "0.84rem", lineHeight: 1.6 }}>
                <div>{order.shippingAddress.streetAddress}</div>
                <div>
                  {order.shippingAddress.city}, {order.shippingAddress.state} — {order.shippingAddress.postalCode}
                </div>
                <div>{order.shippingAddress.country}</div>
                {order.shippingAddress.phone && (
                  <div className="muted num">
                    📞 {order.shippingAddress.phone}
                    {order.shippingAddress.label ? ` · ${order.shippingAddress.label}` : ""}
                  </div>
                )}
              </div>
            ) : (
              <div className="empty">
                <b>No address on file</b>
              </div>
            )}
          </div>
        </div>

        {/* Payment + shipment summary */}
        <div className="admin-grid" style={{ gridTemplateColumns: "1fr", gap: 16 }}>
          <div className="admin-card">
            <h3>Payment</h3>
            {order.payments.length === 0 ? (
              <div className="empty">
                <b>No payments recorded</b>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {order.payments.map((p) => (
                  <div key={p.id} className="kv">
                    <dt>
                      {p.method ?? "—"}
                      <span className="muted num">
                        {" "}
                        · {p.paidAt ? p.paidAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : p.createdAt.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                      </span>
                    </dt>
                    <dd className="num">
                      {formatINR(p.amount)} <span className={`badge ${p.status === "PAID" ? "badge-ok" : p.status === "FAILED" ? "badge-err" : "badge-warn"}`}>{p.status}</span>
                    </dd>
                  </div>
                ))}
                {order.payments.some((p) => p.razorpayPaymentId) && (
                  <details className="kv" style={{ marginTop: 4 }}>
                    <summary style={{ cursor: "pointer", color: "var(--acc)", fontWeight: 600 }}>
                      Razorpay Details
                    </summary>
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
                            <div className="flex justify-between">
                              <span className="muted">Signature</span>
                              <code style={{ color: "var(--t1)" }}>{p.razorpaySignature ? `${p.razorpaySignature.slice(0, 16)}…` : "—"}</code>
                            </div>
                          </div>
                        ))}
                    </div>
                  </details>
                )}
                <div className="kv" style={{ marginTop: 4 }}>
                  <dt>Order total</dt>
                  <dd className="num" style={{ fontWeight: 700 }}>
                    {formatINR(order.total)}
                  </dd>
                </div>
              </div>
            )}
            {payTotal !== 0 && (
              <div className="muted" style={{ marginTop: 6 }}>
                Paid {formatINR(payTotal)} of {formatINR(order.total)}
              </div>
            )}
          </div>

          <div className="admin-card">
            <h3>Shipment</h3>
            {order.shipment ? (
              <dl className="pill-grid">
                <div className="kv">
                  <dt>Status</dt>
                  <dd>
                    <span className="badge">{order.shipment.status.replace(/_/g, " ")}</span>
                  </dd>
                </div>
                <div className="kv">
                  <dt>Courier</dt>
                  <dd>{order.shipment.courier ?? "—"}</dd>
                </div>
                <div className="kv">
                  <dt>Tracking #</dt>
                  <dd>
                    {order.shipment.trackingUrl ? (
                      <Link href={order.shipment.trackingUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--acc)" }}>
                        {order.shipment.trackingNumber ?? "Track"}
                      </Link>
                    ) : (
                      order.shipment.trackingNumber ?? "—"
                    )}
                  </dd>
                </div>
              </dl>
            ) : (
              <div className="empty">
                <b>Not shipped yet</b>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="admin-grid" style={{ gridTemplateColumns: "1fr" }}>
        <div className="admin-card" style={{ padding: 8 }}>
          <h3 style={{ margin: "0 8px 8px" }}>Items</h3>
          {order.items.length === 0 && order.services.length === 0 && order.repairs.length === 0 ? (
            <div className="empty">
              <b>No line items</b>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th style={{ textAlign: "right" }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((i) => (
                    <tr key={i.id}>
                      <td>
                        <span className="badge badge-purple">Product</span>
                      </td>
                      <td>{i.name}</td>
                      <td className="num">{i.quantity}</td>
                      <td className="num">{formatINR(i.unitPrice)}</td>
                      <td className="num" style={{ textAlign: "right" }}>
                        {formatINR(i.lineTotal)}
                      </td>
                    </tr>
                  ))}
                  {order.services.map((s) => {
                    const quote = s.lineTotal === 0 && isQuoteService(order.summary, s.slug);
                    return (
                      <tr key={s.id}>
                        <td>
                          <span className="badge badge-lime">Service</span>
                        </td>
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
                      <td>
                        <span className="badge badge-warn">Repair</span>
                      </td>
                      <td>
                        {r.deviceType} {r.deviceModel}
                        {r.issue ? (
                          <span className="muted"> — {r.issue}</span>
                        ) : null}
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
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "10px 8px 0" }}>
            <span style={{ fontSize: "0.85rem" }}>
              Total <b className="num" style={{ fontSize: "1rem" }}>{formatINR(order.total)}</b>
            </span>
          </div>
        </div>
      </div>

      {/* Repair image management */}
      {repairPanels.length > 0 && (
        <div className="admin-card">
          <RepairImagesPanel repairs={repairPanels} />
        </div>
      )}

      {/* Service device configuration */}
      {order.type === "SERVICE" && serviceDeviceRows(order.summary).length > 0 && (
        <div className="admin-card">
          <h3>Device configuration</h3>
          <dl className="pill-grid">
            {serviceDeviceRows(order.summary).map(([k, v]) => (
              <div className="kv" key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          {isQuoteOrder(order.summary) && (
            <div style={{ marginTop: 8 }}>
              <span className="badge badge-warn">Contains quote-based services — final pricing after inspection</span>
            </div>
          )}
        </div>
      )}

      <div className="admin-grid cols-2" style={{ gridTemplateColumns: "2fr 1fr" }}>
        {/* Timeline */}
        <div className="admin-card">
          <h3>Timeline</h3>
          {order.timeline.length === 0 ? (
            <div className="empty">
              <b>No timeline yet</b>
            </div>
          ) : (
            <div className="tl">
              {order.timeline.map((t) => (
                <div key={t.id} className="tl-item">
                  <span className="badge" style={{ marginBottom: 4 }}>
                    {ORDER_STATUS_LABELS[t.status]}
                  </span>
                  {t.note && <div style={{ fontSize: "0.82rem", color: "var(--t2)" }}>{t.note}</div>}
                  <div className="muted num" style={{ fontSize: "0.68rem" }}>
                    {t.createdAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="admin-card">
          <h3>Notes & messages</h3>
          {order.messages.length === 0 ? (
            <div className="empty">
              <b>No notes yet</b>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
                  <div>{m.message}</div>
                  <div className="muted num" style={{ fontSize: "0.68rem", marginTop: 4 }}>
                    {m.author} · {m.createdAt.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {order.warranty && (
        <div className="admin-card">
          <h3>Warranty</h3>
          <dl className="pill-grid">
            <div className="kv">
              <dt>Status</dt>
              <dd>
                <span className="badge">{order.warranty.status}</span>
              </dd>
            </div>
            <div className="kv">
              <dt>Window</dt>
              <dd className="num">
                {order.warranty.startDate?.toLocaleDateString("en-IN")} → {order.warranty.endDate?.toLocaleDateString("en-IN")}
              </dd>
            </div>
          </dl>
        </div>
      )}

      <OrderDetailClient
        orderId={order.id}
        orderNumber={order.orderNumber}
        currentStatus={order.status}
        statuses={statuses}
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
      />
    </div>
  );
}