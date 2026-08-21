import { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAuth, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "My Orders | KeebForge",
  robots: { index: false, follow: false },
};

const STATUS_LABELS: Record<string, string> = {
  ORDER_RECEIVED: "Order Received",
  ORDER_CONFIRMED: "Order Confirmed",
  PAYMENT_PENDING: "Payment Pending",
  PAYMENT_RECEIVED: "Payment Received",
  PARTS_BOOKED: "Parts Booked",
  PARTS_SHIPPED: "Parts Shipped",
  PARTS_RECEIVED: "Parts Received",
  IN_QUEUE: "In Queue",
  WORK_STARTED: "Work Started",
  TESTING: "Testing",
  COMPLETED: "Completed",
  PACKING: "Packing",
  SHIPMENT_BOOKED: "Shipment Booked",
  SHIPMENT_PICKED_UP: "Shipment Picked Up",
  IN_TRANSIT: "In Transit",
  DELIVERED: "Delivered",
  TESTING_WARRANTY_ACTIVE: "Warranty Active",
  ORDER_COMPLETED: "Order Completed",
};

const STATUS_COLORS: Record<string, string> = {
  ORDER_RECEIVED: "status-info",
  ORDER_CONFIRMED: "status-info",
  PAYMENT_PENDING: "status-warning",
  PAYMENT_RECEIVED: "status-info",
  PARTS_BOOKED: "status-info",
  PARTS_SHIPPED: "status-info",
  PARTS_RECEIVED: "status-info",
  IN_QUEUE: "status-info",
  WORK_STARTED: "status-info",
  TESTING: "status-info",
  COMPLETED: "status-success",
  PACKING: "status-info",
  SHIPMENT_BOOKED: "status-info",
  SHIPMENT_PICKED_UP: "status-info",
  IN_TRANSIT: "status-info",
  DELIVERED: "status-success",
  TESTING_WARRANTY_ACTIVE: "status-success",
  ORDER_COMPLETED: "status-success",
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
      paymentStatus: true,
      total: true,
      createdAt: true,
      items: { select: { name: true, quantity: true } },
      services: { select: { name: true, quantity: true } },
      repairs: { select: { deviceType: true, deviceModel: true } },
    },
  });
}

export default async function OrdersPage() {
  const { user } = await getCurrentAuth();
  if (!user) redirect("/login");

  const auth = await requireUser();
  const orders = await getOrders(auth.profile.id);

  return (
    <div className="account-orders">
      <section className="account-section">
        <header className="account-section-header">
          <h2 className="account-section-title">My Orders</h2>
          <p className="account-section-desc">View and track all your orders</p>
        </header>

        {orders.length === 0 ? (
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
          <div className="account-orders-table-container">
            <table className="account-orders-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Date</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <span className="account-order-number">{order.orderNumber}</span>
                      <span className="account-order-type">{order.type}</span>
                    </td>
                    <td>
                      <time dateTime={order.createdAt.toISOString()}>
                        {new Date(order.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </td>
                    <td>
                      <div className="account-order-items-preview">
                        {order.items.slice(0, 2).map((item, i) => (
                          <span key={i} className="account-order-item-name">
                            {item.name} {item.quantity > 1 ? `×${item.quantity}` : ""}
                          </span>
                        ))}
                        {order.services.slice(0, 2).map((service, i) => (
                          <span key={`s-${i}`} className="account-order-item-name">
                            {service.name} {service.quantity > 1 ? `×${service.quantity}` : ""}
                          </span>
                        ))}
                        {order.repairs.slice(0, 1).map((repair, i) => (
                          <span key={`r-${i}`} className="account-order-item-name">
                            {repair.deviceType} Repair
                          </span>
                        ))}
                        {order.items.length + order.services.length + order.repairs.length > 2 && (
                          <span className="account-order-more">
                            +{order.items.length + order.services.length + order.repairs.length - 2} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="account-order-total">
                      ₹{(order.total / 100).toLocaleString("en-IN", {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0,
                      })}
                    </td>
                    <td>
                      <span className={`account-order-status ${STATUS_COLORS[order.status] ?? ""}`}>
                        {STATUS_LABELS[order.status] ?? order.status}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/track/${order.orderNumber}`}
                        className="btn-ghost btn-sm"
                      >
                        Track
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}