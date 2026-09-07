import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { formatINR } from "@/lib/utils/money";
import { prisma } from "@/lib/db/prisma";
import { getCurrentAuth } from "@/lib/auth/session";
import { SERVICE_UNIT_LABELS } from "@/lib/orders";
import { buildMetadata } from "@/lib/seo";
import { CopyPaymentId } from "@/components/order/CopyPaymentId";
import { OrderPaymentSummary } from "@/components/order/OrderPaymentSummary";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}): Promise<Metadata> {
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
    else if (typeof v === "boolean")
      rows.push([k, v ? "Included" : "Not Included"]);
  };
  if (s.deviceType === "KEYBOARD" || s.deviceType === "MOUSE") {
    rows.push(["Device", s.deviceType === "KEYBOARD" ? "Keyboard" : "Mouse"]);
    rows.push([
      "Unit",
      [s.brand, s.model].filter((v) => typeof v === "string" && v).join(" "),
    ]);
    push("Layout", s.layout);
    push("Switch model", s.switchModel);
    if (typeof s.switchQuantity === "number")
      rows.push(["Switches", String(s.switchQuantity)]);
    if (typeof s.stabilizerQuantity === "number" && s.stabilizerQuantity > 0)
      rows.push(["Stabilizers", String(s.stabilizerQuantity)]);
    push("Keycaps", s.keycapsIncluded);
  }
  return rows;
}

export default async function OrderSuccessPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const { user } = await getCurrentAuth();
  const order = await prisma.order.findUnique({
    where: { orderNumber: orderNumber.toUpperCase() },
    include: {
      items: {
        include: {
          product: {
            include: {
              images: {
                where: { active: true },
                orderBy: [{ primary: "desc" }, { sortOrder: "asc" }],
                take: 1,
              },
            },
          },
        },
      },
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
  const summaryServices = Array.isArray(
    (order.summary as { services?: ServiceSummaryLine[] } | null)?.services,
  )
    ? (order.summary as { services: ServiceSummaryLine[] }).services
    : [];
  const isQuoteLine = (slug: string) =>
    summaryServices.some(
      (l) =>
        typeof l.serviceName === "string" &&
        l.isQuote &&
        l.serviceName === slug,
    );

  const headline = paid
    ? "Payment successful!"
    : quoteRequest
      ? "Quote request received"
      : "Order received";
  const subline = quoteRequest
    ? "We've received your configuration. Final pricing will be confirmed after inspection — no payment was taken."
    : null;

  const deviceRowsOut = deviceRows(order.summary);

  const grandLabel = paid ? "Total Paid" : quoteRequest ? "Due Now" : "Total";

  return (
    <main>
      <section className="svc-section order-success-page">
        <div className="wrap">
          <header className="order-success-hero">
            <p className="order-success-eyebrow">{"// Order Confirmed"}</p>
            <div
              className="order-success-check"
              aria-hidden="true"
              style={paid ? undefined : { borderColor: "var(--bdr-h)" }}
            >
              {paid ? (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--acc)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--acc)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
            </div>
            <h1 className="order-success-title">{headline}</h1>
            <p className="order-success-sub">{subline}</p>
            <p className="order-success-order">
              <span className="order-success-order-label">Order number</span>
              <b>{order.orderNumber}</b>
            </p>
          </header>

          <div className="os-section-head">
            <h2 className="os-section-title">Your Order</h2>
            <span className="os-section-rule" aria-hidden="true" />
          </div>

          <div className="os-grid">
            <div className="os-col">
              {order.shippingAddress ? (
                <div className="card p-6 os-card-fill">
                  <div className="os-card-head">
                    <h2 className="os-card-title">Delivery Address</h2>
                  </div>
                  <div className="os-addr-block">
                    <div className="os-addr-recipient">
                      <svg
                        className="os-addr-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      <span className="os-addr-name">{order.customerName}</span>
                    </div>
                    <address className="os-address">
                      {order.shippingAddress.apartment && (
                        <span>{order.shippingAddress.apartment}</span>
                      )}
                      <span className="os-addr-home">
                        {order.shippingAddress.streetAddress}
                      </span>
                      <span>
                        {order.shippingAddress.city},{" "}
                        {order.shippingAddress.state}{" "}
                        {order.shippingAddress.postalCode}
                      </span>
                      <span>{order.shippingAddress.country}</span>
                    </address>
                    {(order.shippingAddress.phone || order.customerPhone) && (
                      <div className="os-addr-contact">
                        <span className="os-addr-contact-label">Phone</span>
                        <span className="os-addr-contact-value">
                          {order.shippingAddress.phone ?? order.customerPhone}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="card p-6 os-card-fill">
                  <div className="os-card-head">
                    <h2 className="os-card-title">Customer</h2>
                  </div>
                  <dl className="os-customer">
                    <div>
                      <dt>Name</dt>
                      <dd>{order.customerName}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>{order.customerEmail}</dd>
                    </div>
                    {order.customerPhone && (
                      <div>
                        <dt>Phone</dt>
                        <dd>{order.customerPhone}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>

            <div className="os-col">
              <div className="card p-6 os-card-fill">
                <div className="os-card-head">
                  <h2 className="os-card-title">Order Summary</h2>
                </div>
                {isService && deviceRowsOut.length > 0 && (
                  <div className="os-device">
                    <h3 className="os-device-title">Device</h3>
                    <dl className="os-device-rows">
                      {deviceRowsOut.map(([k, v]) => (
                        <div key={k} className="os-device-row">
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                )}
                <ul className="os-lines">
                  {order.services.map((svc) => {
                    const quote = svc.lineTotal === 0 && isQuoteLine(svc.slug);
                    return (
                      <li key={svc.id} className="os-line">
                        <div className="os-line-main">
                          <div className="min-w-0">
                            <p className="os-line-name">{svc.name}</p>
                            <p className="os-line-meta">
                              {quote
                                ? "QUOTE REQUIRED"
                                : `${svc.quantity} × ${formatINR(svc.unitPrice)} ${SERVICE_UNIT_LABELS[svc.unit]}`}
                            </p>
                          </div>
                        </div>
                        <span className="os-line-total">
                          {quote ? (
                            <span className="quote-chip">QUOTE</span>
                          ) : (
                            formatINR(svc.lineTotal)
                          )}
                        </span>
                      </li>
                    );
                  })}
                  {order.items.map((item) => (
                    <li key={item.id} className="os-line">
                      <div className="os-line-main">
                        {item.product?.images?.[0] ? (
                          <Image
                            src={item.product.images[0].url}
                            alt={item.product.name}
                            width={46}
                            height={46}
                            className="os-line-thumb"
                            sizes="46px"
                          />
                        ) : (
                          <span
                            className="os-line-thumb os-line-thumb-fallback"
                            aria-hidden="true"
                          >
                            ⌨
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="os-line-name">
                            {item.product?.name ?? item.name}
                          </p>
                          <p className="os-line-meta">
                            Qty {item.quantity} · {formatINR(item.unitPrice)}{" "}
                            each
                          </p>
                        </div>
                      </div>
                      <span className="os-line-total">
                        {formatINR(item.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
                <dl className="os-totals">
                  <div className="os-total-row">
                    <dt>Subtotal</dt>
                    <dd>
                      {order.subtotal === 0 ? "—" : formatINR(order.subtotal)}
                    </dd>
                  </div>
                  {order.discount > 0 && (
                    <div className="os-total-row os-total-discount">
                      <dt>Discount</dt>
                      <dd>−{formatINR(order.discount)}</dd>
                    </div>
                  )}
                  <div className="os-total-row">
                    <dt>Shipping</dt>
                    <dd>
                      {order.shipping === 0
                        ? order.type === "PRODUCT" && !quoteRequest
                          ? "FREE"
                          : "Calculated later"
                        : formatINR(order.shipping)}
                    </dd>
                  </div>
                  <div className="os-total-grand">
                    <dt>{grandLabel}</dt>
                    <dd>
                      {paid
                        ? formatINR(order.total)
                        : quoteRequest
                          ? "—"
                          : formatINR(order.total)}
                    </dd>
                  </div>
                </dl>
                <div className="os-pay-block">
                  {paid ? (
                    <div className="os-pay-line">
                      <span className="os-pay-line-label">Payment</span>
                      <span className="badge badge-lime">Paid ✓</span>
                      {payment?.razorpayPaymentId && (
                        <>
                          <span className="os-pay-grow" aria-hidden="true" />
                          <span className="os-pay-id">
                            {payment.razorpayPaymentId}
                          </span>
                          <CopyPaymentId value={payment.razorpayPaymentId} />
                        </>
                      )}
                    </div>
                  ) : quoteRequest ? (
                    <div className="os-pay-line">
                      <span className="os-pay-line-label">Payment</span>
                      <span className="os-pay-line-pending">Pending</span>
                      <p className="os-pay-note">
                        Amount will be confirmed shortly.
                      </p>
                    </div>
                  ) : (
                    <OrderPaymentSummary
                      orderNumber={order.orderNumber}
                      total={order.total}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="os-section-head">
            <h2 className="os-section-title">What happens next?</h2>
            <span className="os-section-rule" aria-hidden="true" />
          </div>

          <div className="os-process-box">
            <ol className="os-process">
              <li className="os-process-step">
                <span className="os-process-num">01</span>
                <h3 className="os-process-title">Confirmation</h3>
                <p className="os-process-text">
                  We&apos;ll email your order confirmation &amp; receipt to{" "}
                  <b>{order.customerEmail}</b>.
                </p>
              </li>
              <li className="os-process-step">
                <span className="os-process-num">02</span>
                <h3 className="os-process-title">Processing</h3>
                <p className="os-process-text">
                  Our team reviews your order and starts working on it.
                </p>
              </li>
              <li className="os-process-step">
                <span className="os-process-num">03</span>
                <h3 className="os-process-title">Tracking</h3>
                <p className="os-process-text">
                  Track your order from your KeebForge account.
                </p>
              </li>
            </ol>
          </div>

          <div className="os-actions">
            {user ? (
              <Link href="/account/orders" className="btn-prime btn-sm">
                View Order <span aria-hidden="true">&rarr;</span>
              </Link>
            ) : (
              <Link href="/contact" className="btn-prime btn-sm">
                Contact Us
              </Link>
            )}
            <Link href="/" className="btn-ghost btn-sm">
              Back to Home
            </Link>
          </div>
          {!user && (
            <p className="os-cta-note">
              <Link href="/auth/login" style={{ color: "var(--acc)" }}>
                Sign in or create an account
              </Link>{" "}
              with this email to get the full order view.
            </p>
          )}

          <p className="os-support">
            Need help? <Link href="/contact">Contact our support team</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
