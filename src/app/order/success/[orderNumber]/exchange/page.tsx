import type { Metadata } from "next";
import { normalizeOrderNumber } from "@/lib/payments/order-capability";
import { buildMetadata } from "@/lib/seo";
import { ExchangeContinue } from "./ExchangeContinue";

// A prefetch or a link scanner must never redeem the code.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}): Promise<Metadata> {
  const { orderNumber } = await params;
  return buildMetadata({
    title: "Confirm Payment Access | KeebForge",
    description: "Confirm you want to open your KeebForge order for payment.",
    path: `/order/success/${orderNumber}/exchange`,
    noIndex: true,
  });
}

/**
 * Interstitial between the emailed exchange code and the order page.
 *
 * Deliberately does NOT touch the database and does NOT echo the code anywhere
 * except into the Continue button's POST body. A GET here is inert: it renders a
 * button and nothing else. That is what makes the code single-use rather than
 * single-click — a mail client, chat client or security scanner that follows the
 * link cannot spend it.
 *
 * No Razorpay script loads on this page, so the exchange code never reaches
 * Razorpay's risk-detection bundle.
 */
export default async function ExchangePage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { orderNumber } = await params;
  const search = await searchParams;
  const raw = search.code;
  const code = typeof raw === "string" ? raw : null;
  const order = normalizeOrderNumber(orderNumber);

  return (
    <main>
      <section className="svc-section order-success-page">
        <div className="wrap">
          <header className="order-success-hero">
            <p className="order-success-eyebrow">{"// Payment Access"}</p>
            <h1 className="order-success-title">Open your order</h1>
            <p className="order-success-sub">
              {order
                ? "This link gives this browser access to pay for your order. It works once."
                : "This link is incomplete. Open the link straight from your order confirmation email."}
            </p>
            {order && (
              <p className="order-success-order">
                <span className="order-success-order-label">Order number</span>
                <b>{order}</b>
              </p>
            )}
          </header>

          <div className="os-actions">
            <ExchangeContinue orderNumber={order} code={code} />
          </div>

          <div className="os-process-box">
            <p className="os-process-text">
              Nothing is shared with anyone else, and the link stops working once
              you continue. Prefer not to?{" "}
              <a href="/track-order" style={{ color: "var(--acc)" }}>
                Track the order
              </a>{" "}
              without opening it.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}