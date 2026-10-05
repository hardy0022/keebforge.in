import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/ui/PageHero";
import { TrackOrder } from "@/components/support/TrackOrder";
import { buildMetadata } from "@/lib/seo";
import { normalizeOrderNumber } from "@/lib/payments/order-capability";
import { canPayFromCookie } from "@/lib/payments/order-access";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = buildMetadata({
  title: "Track Your Order & Repair Status | KeebForge",
  description:
    "Track your KeebForge order by order number — see the latest workshop and shipping status of your keyboard or mouse order from Jammu & Kashmir to anywhere in India.",
  path: "/track-order",
});

/**
 * Payment entitlement is separate from tracking, and it comes from the HttpOnly
 * payment cookie rather than the URL — there is no `?pay=` for a token to leak
 * through here any more. The boolean is resolved once for the order named in the
 * URL; if the customer searches a different number, the Pay button re-checks
 * server-side at /api/payments/pay-inline and fails there if the cookie does not
 * match, exactly as an unrecognised order number would.
 */
async function resolveCanPay(rawOrder: string | undefined): Promise<boolean> {
  const orderNumber = normalizeOrderNumber(rawOrder);
  if (!orderNumber) return false;
  const order = await prisma.order.findUnique({
    where: { orderNumber },
    select: { billingDetails: true },
  });
  if (!order) return false;
  return canPayFromCookie(order.billingDetails);
}

export default async function TrackOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const canPay = await resolveCanPay(order);

  return (
    <main className="track-page">
      <PageHero
        tag="// SUPPORT"
        title="Track your order."
        desc="Enter your order number below to see the latest status of your KeebForge order — from order placed to delivered."
      />
      <TrackOrder initialOrder={order} canPay={canPay} />
      <div className="track-help-panel wrap">
        <div className="track-help-card">
          <div>
            <p className="track-help-title">Need help?</p>
            <p className="track-help-desc">
              Something wrong with your order, or can&apos;t find what
              you&apos;re looking for?
            </p>
          </div>
          <Link href="/contact" className="btn-prime">
            Contact Us
          </Link>
        </div>
      </div>
    </main>
  );
}