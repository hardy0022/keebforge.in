import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { formatINR } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { getCurrentAuth } from "@/lib/auth";
import { ORDER_STATUS_LABELS, SERVICE_UNIT_LABELS } from "@/lib/orders";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({ params }: { params: Promise<{ orderNumber: string }> }): Promise<Metadata> {
  const { orderNumber } = await params;
  return buildMetadata({
    title: `Order ${orderNumber} Confirmed | KeebForge`,
    description: `Your KeebForge order ${orderNumber} has been received.`,
    path: `/order/success/${orderNumber}`,
  });
}

type ServiceSummaryLine = {
  serviceName?: string;
  quantity?: number;
  unitPrice?: number | null;
  isQuote?: boolean;
};

function deviceRows(summary: unknown): Array<[string, string]> {
  if (!summary || typeof summary !== "object") return [];
  const s = summary as Record<string, unknown>;
  const rows: Array<[string, string]> = [];
  const push = (k: string, v: unknown) => {
    if (typeof v === "string" && v.trim()) rows.push([k, v]);
    else if (typeof v === "number") rows.push([k, String(v)]);
    else if (typeof v === "boolean") rows.push([k, v ? "Included" : "Not Included"]);
  };
  if (s.deviceType === "KEYBOARD" || s.deviceType === "MOUSE") {
    rows.push(["Device", s.deviceType === "KEYBOARD" ? "Keyboard" : "Mouse"]);
    rows.push(["Unit", [s.brand, s.model].filter((v) => typeof v === "string" && v).join(" ")]);
    push("Layout", s.layout);
    push("Switch model", s.switchModel);
    if (typeof s.switchQuantity === "number") rows.push(["Switches", String(s.switchQuantity)]);
    if (typeof s.stabilizerQuantity === "number" && s.stabilizerQuantity > 0) rows.push(["Stabilizers", String(s.stabilizerQuantity)]);
    push("Keycaps", s.keycapsIncluded);
  }
  return rows;
}

export default async function OrderSuccessPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  const { user } = await getCurrentAuth();
  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.toUpperCase() },
    include: {
      items: { include: { product: { include: { images: { where: { active: true }, orderBy: [{ primary: "desc" }, { sortOrder: "asc" }], take: 1 } } } } },
      services: true,
      payments: { orderBy: { createdAt: "desc" }, take: 1 },
      shippingAddress: true,
    },
  });

  if (!order) notFound();

  const payment = order.payments[0];
  const paid = order.paymentStatus === "PAID";
  const isService = order.type === "SERVICE";
  const quoteRequest = isService && !paid && order.subtotal === 0;

  // Quote flags come from the creation snapshot so zero-priced rows stay honest.
  const summaryServices = Array.isArray((order.summary as { services?: ServiceSummaryLine[] } | null)?.services)
    ? ((order.summary as { services: ServiceSummaryLine[] }).services)
    : [];
  const isQuoteLine = (slug: string) =>
    summaryServices.some((l) => typeof l.serviceName === "string" && l.isQuote && l.serviceName === slug);

  const headline = paid ? "Payment Successful" : quoteRequest ? "Quote Request Received" : "Order Received";
  const subline = paid
    ? "Your service order has been received. We'll email your receipt shortly."
    : quoteRequest
      ? "We've received your configuration. Final pricing will be confirmed after inspection — no payment was taken."
      : "Your order has been received.";

  return (
    <main>
      <section className="svc-section">
        <div className="wrap">
          <div className="text-center mb-12">
            <div
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-[var(--acc-dim)] border border-[var(--acc)] mb-6"
              aria-hidden="true"
              style={paid ? undefined : { borderColor: "var(--bdr-h)" }}
            >
              {paid ? (
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              ) : (
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
            </div>
            <h1 className="font-display text-3xl font-bold text-[var(--t1)] mb-2">✓ {headline}</h1>
            <p className="text-[var(--t2)]">
              Order <span className="font-display font-mono text-[var(--acc)]">{order.orderNumber}</span> — {subline}
            </p>
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Device configuration (service orders) */}
            {isService && (
              <div className="card p-6">
                <h2 className="font-display text-xl font-bold text-[var(--t1)] mb-4">Device</h2>
                <dl className="space-y-3">
                  {deviceRows(order.summary).map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-6">
                      <dt className="text-[var(--t3)]">{k}</dt>
                      <dd className="text-[var(--t1)] text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            {/* Services / products */}
            <div className="card p-6">
              <h2 className="font-display text-xl font-bold text-[var(--t1)] mb-4">
                {isService ? "Services" : "Items"}
              </h2>
              <div className="space-y-3 mb-4">
                {order.services.map((svc) => {
                  const quote = svc.lineTotal === 0 && isQuoteLine(svc.slug);
                  return (
                    <div key={svc.id} className="flex justify-between gap-3">
                      <div>
                        <p className="text-[var(--t1)]">{svc.name}</p>
                        <p className="text-xs text-[var(--t3)]">
                          {quote ? "QUOTE REQUIRED" : `${svc.quantity} × ${formatINR(svc.unitPrice)} ${SERVICE_UNIT_LABELS[svc.unit]}`}
                        </p>
                      </div>
                      <span className="font-display font-bold text-[var(--t1)] whitespace-nowrap">
                        {quote ? <span className="quote-chip">QUOTE</span> : formatINR(svc.lineTotal)}
                      </span>
                    </div>
                  );
                })}
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {item.product?.images?.[0] && (
                        <Image src={item.product.images[0].url} alt={item.product.name} width={48} height={48} className="rounded-lg object-cover" sizes="48px" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--t1)] truncate">{item.product?.name ?? item.name}</p>
                        <p className="text-xs text-[var(--t3)]">Qty {item.quantity}</p>
                      </div>
                    </div>
                    <span className="font-display font-bold text-[var(--t1)] whitespace-nowrap">
                      {formatINR(item.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="border-t border-[var(--bdr)] pt-4 space-y-2">
                <div className="flex justify-between text-sm text-[var(--t3)]">
                  <span>Subtotal</span>
                  <span className="text-[var(--t1)]">{order.subtotal === 0 ? "—" : formatINR(order.subtotal)}</span>
                </div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-sm text-[var(--ok)]">
                    <span>Discount</span>
                    <span>−{formatINR(order.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm text-[var(--t3)]">
                  <span>Shipping</span>
                  <span>{order.shipping === 0 ? (order.type === "PRODUCT" && !quoteRequest ? "FREE" : "Calculated later") : formatINR(order.shipping)}</span>
                </div>
                <div className="flex justify-between font-display font-bold text-[var(--t1)]">
                  <span>{paid || !quoteRequest ? "Total" : "Due Now"}</span>
                  <span>{paid ? formatINR(order.total) : quoteRequest ? "₹0" : formatINR(order.total)}</span>
                </div>
              </div>
            </div>

            {/* Delivery address (product orders) */}
            {order.shippingAddress && (
              <div className="card p-6">
                <h2 className="font-display text-xl font-bold text-[var(--t1)] mb-4">Delivery Address</h2>
                <address className="not-italic text-sm text-[var(--t2)] leading-6">
                  {order.shippingAddress.apartment && <>{order.shippingAddress.apartment}<br /></>}
                  {order.shippingAddress.streetAddress}<br />
                  {order.shippingAddress.city}, {order.shippingAddress.state} {order.shippingAddress.postalCode}<br />
                  {order.shippingAddress.country}
                  {order.customerPhone && <><br />{order.customerPhone}</>}
                </address>
              </div>
            )}

            {/* Payment + status */}
            <div className="card p-6 lg:col-span-2">
              <h2 className="font-display text-xl font-bold text-[var(--t1)] mb-4">Payment & Status</h2>
              <dl className="grid gap-3 md:grid-cols-2">
                <div className="flex justify-between md:block">
                  <dt className="text-[var(--t3)]">Order Status</dt>
                  <dd><span className="badge badge-lime">{ORDER_STATUS_LABELS[order.status]}</span></dd>
                </div>
                <div className="flex justify-between md:block">
                  <dt className="text-[var(--t3)]">Payment Status</dt>
                  <dd>
                    <span className={`badge ${order.paymentStatus === "PAID" ? "badge-ok" : order.paymentStatus === "FAILED" ? "badge-err" : "badge-warn"}`}>
                      {order.paymentStatus}
                    </span>
                  </dd>
                </div>
                {payment?.razorpayPaymentId && (
                  <div className="flex justify-between md:block">
                    <dt className="text-[var(--t3)]">Razorpay Payment ID</dt>
                    <dd className="font-mono text-xs text-[var(--t2)] break-all">{payment.razorpayPaymentId}</dd>
                  </div>
                )}
                {payment?.method && (
                  <div className="flex justify-between md:block">
                    <dt className="text-[var(--t3)]">Method</dt>
                    <dd className="text-[var(--t1)] capitalize">{payment.method}</dd>
                  </div>
                )}
              </dl>
              {quoteRequest && (
                <p className="text-sm text-[var(--warn)] mt-4">
                  A quote covers inspection-based work. Once we confirm pricing you&apos;ll receive a payment link for the agreed amount.
                </p>
              )}
            </div>
          </div>

          <div className="mt-10 flex flex-wrap gap-4 justify-center">
            {user ? (
              <Link href="/account/orders" className="btn-prime">
                View Order
              </Link>
            ) : (
              <Link href="/contact" className="btn-prime">
                Contact Us
              </Link>
            )}
            <Link href="/" className="btn-ghost">
              Back to Home
            </Link>
          </div>
          {!user && (
            <p className="text-center text-sm text-[var(--t3)] mt-4">
              <Link href="/auth/login" style={{ color: "var(--acc)" }}>Sign in or create an account</Link> with this email to track the order.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
