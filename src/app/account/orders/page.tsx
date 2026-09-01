import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/money";
import { ORDER_STATUS_CHIP, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/lib/orders";

export const metadata: Metadata = {
  title: "My Orders | KeebForge",
  robots: { index: false, follow: false },
};

async function getOrders(profileId: string) {
  return prisma.order.findMany({
    where: { profileId, isDeleted: false },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      type: true,
      status: true,
      total: true,
      createdAt: true,
      items: { select: { name: true, quantity: true } },
      services: { select: { name: true, quantity: true } },
      repairs: { select: { deviceType: true } },
    },
  });
}

export default async function OrdersPage() {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/auth/login");

  const auth = await requireUser();
  const orders = await getOrders(auth.profile.id);

  return (
    <div className="account-stack">
      <section className="account-section">
        {orders.length === 0 ? (
          <div className="account-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <h3>No orders yet</h3>
            <p>When you place an order, it will appear here.</p>
            <Link href="/shop" className="btn-prime">
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="account-order-list">
            {orders.map((order) => {
              const preview = [
                ...order.items.slice(0, 2).map((i) => `${i.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`),
                ...order.services.slice(0, 2).map((s) => `${s.name}${s.quantity > 1 ? ` ×${s.quantity}` : ""}`),
                ...order.repairs.slice(0, 1).map((r) => `${r.deviceType} Repair`),
              ];
              const extra =
                order.items.length + order.services.length + order.repairs.length - preview.length;

              return (
                <div key={order.id} className="account-order-item account-order-item--grid">
                  <div className="account-order-info">
                    <div className="account-order-header">
                      <Link href={`/order/success/${order.orderNumber}`} className="account-order-number is-link">
                        {order.orderNumber}
                      </Link>
                      <span className="account-order-type">{ORDER_TYPE_LABELS[order.type]}</span>
                    </div>
                    <div className="account-order-meta">
                      <span className="account-order-date">
                        {new Date(order.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="account-order-items-preview">
                    {preview.map((line, i) => (
                      <span key={i} className="account-order-item-name">
                        {line}
                      </span>
                    ))}
                    {extra > 0 && <span className="account-order-more">+{extra} more</span>}
                  </div>

                  <div className="account-order-total">{formatINR(order.total)}</div>

                  <span className={`account-order-status ${ORDER_STATUS_CHIP[order.status]}`}>
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>

                  <Link href={`/order/success/${order.orderNumber}`} className="btn-ghost btn-sm">
                    Track
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}