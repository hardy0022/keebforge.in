import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@prisma/client";

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
  if (!user) redirect("/login");

  const auth = await requireUser();
  const [stats, recentOrders] = await Promise.all([
    getOrderStats(auth.profile.id),
    getRecentOrders(auth.profile.id),
  ]);

  return (
    <div className="account-overview">
      <section className="account-section">
        <header className="account-section-header">
          <h2 className="account-section-title">Overview</h2>
          <p className="account-section-desc">Welcome back! Here&apos;s a quick summary of your account.</p>
        </header>

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
          <Link href="/account/orders" className="account-section-link">
            View all orders
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </header>

        {recentOrders.length === 0 ? (
          <div className="account-empty">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            <h3>No orders yet</h3>
            <p>When you place an order, it will appear here.</p>
            <Link href="/shop" className="btn-prime" style={{ marginTop: 16, display: "inline-flex" }}>
              Start Shopping
            </Link>
          </div>
        ) : (
          <div className="account-orders-list">
            {recentOrders.map((order) => (
              <Link key={order.id} href={`/track/${order.orderNumber}`} className="account-order-item">
                <div className="account-order-info">
                  <div className="account-order-header">
                    <span className="account-order-number">{order.orderNumber}</span>
                    <span className={`account-order-status account-order-status--${order.status.toLowerCase().replace(/_/g, "-")}`}>
                      {order.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="account-order-meta">
                    <span className="account-order-date">{new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    <span className="account-order-items">{order.items.length} item{order.items.length !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="account-order-total">
                  ₹{(order.total / 100).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
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
            <h3>Edit Profile</h3>
            <p>Update your name, email, and phone number</p>
          </Link>

          <Link href="/account/addresses" className="account-action-card">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <h3>Manage Addresses</h3>
            <p>Add or update your shipping addresses</p>
          </Link>

          <Link href="/shop" className="account-action-card">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            <h3>Continue Shopping</h3>
            <p>Browse keyboards, switches, and accessories</p>
          </Link>
        </div>
      </section>
    </div>
  );
}