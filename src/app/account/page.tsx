import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";
import { formatINR } from "@/lib/money";
import { ORDER_STATUS_CHIP, ORDER_STATUS_LABELS } from "@/lib/orders";

export const metadata: Metadata = {
  title: "My Account | KeebForge",
  robots: { index: false, follow: false },
};

const EXCLUDED_STATUSES: OrderStatus[] = ["ORDER_COMPLETED", "DELIVERED", "TESTING_WARRANTY_ACTIVE"];
const COMPLETED_STATUSES: OrderStatus[] = ["ORDER_COMPLETED", "DELIVERED"];

async function getOrderStats(profileId: string) {
  const [totalOrders, pendingOrders, completedOrders] = await Promise.all([
    prisma.order.count({ where: { profileId, isDeleted: false } }),
    prisma.order.count({
      where: {
        profileId,
        isDeleted: false,
        status: { notIn: EXCLUDED_STATUSES },
      },
    }),
    prisma.order.count({
      where: {
        profileId,
        isDeleted: false,
        status: { in: COMPLETED_STATUSES },
      },
    }),
  ]);

  return { totalOrders, pendingOrders, completedOrders };
}

async function getRecentOrders(profileId: string) {
  return prisma.order.findMany({
    where: { profileId, isDeleted: false },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      createdAt: true,
      items: { select: { name: true } },
    },
  });
}

export default async function AccountPage() {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/auth/login");

  const auth = await requireUser();
  const [stats, recentOrders] = await Promise.all([
    getOrderStats(auth.profile.id),
    getRecentOrders(auth.profile.id),
  ]);

  return (
    <div className="account-stack">
      <section className="account-section">
        <div className="account-stats">
          <div className="account-stat">
            <span className="account-stat-value">{stats.totalOrders}</span>
            <span className="account-stat-label">Total Orders</span>
          </div>
          <div className="account-stat">
            <span className="account-stat-value">{stats.pendingOrders}</span>
            <span className="account-stat-label">Active Orders</span>
          </div>
          <div className="account-stat">
            <span className="account-stat-value">{stats.completedOrders}</span>
            <span className="account-stat-label">Completed</span>
          </div>
        </div>
      </section>

      <section className="account-section">
        <header className="account-section-header">
          <div>
            <h2 className="account-section-title">Recent Orders</h2>
            <p className="account-section-desc">Your latest order activity</p>
          </div>
          {recentOrders.length > 0 && (
            <Link href="/account/orders" className="account-section-link">
              View all orders
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          )}
        </header>

        {recentOrders.length === 0 ? (
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
            {recentOrders.map((order) => (
              <Link key={order.id} href={`/order/success/${order.orderNumber}`} className="account-order-item is-link">
                <div className="account-order-info">
                  <div className="account-order-header">
                    <span className="account-order-number">{order.orderNumber}</span>
                    <span className={`account-order-status ${ORDER_STATUS_CHIP[order.status]}`}>
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </div>
                  <div className="account-order-meta">
                    <span className="account-order-date">{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span>{order.items.length} item{order.items.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="account-order-total">{formatINR(order.total)}</div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="account-section">
        <header className="account-section-header">
          <div>
            <h2 className="account-section-title">Quick Actions</h2>
            <p className="account-section-desc">Common tasks you might want to do</p>
          </div>
        </header>

        <div className="account-actions">
          <Link href="/account/profile" className="account-action-card">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <div>
              <h3>Profile &amp; Addresses</h3>
              <p>Info and shipping addresses</p>
            </div>
          </Link>

          <Link href="/account/orders" className="account-action-card">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <div>
              <h3>Orders</h3>
              <p>Track and manage your orders</p>
            </div>
          </Link>

          <Link href="/account/settings" className="account-action-card">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <div>
              <h3>Settings</h3>
              <p>Preferences, password, security</p>
            </div>
          </Link>

          <Link href="/shop" className="account-action-card">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <div>
              <h3>Continue Shopping</h3>
              <p>Keyboard parts &amp; mods</p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}