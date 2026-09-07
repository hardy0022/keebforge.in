import Link from "next/link";
import type { Metadata } from "next";
import type { ShippingStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth/admin";
import { getAdminShipments } from "@/lib/admin";
import { ShipmentsManager, type ShipmentRow } from "./ShipmentsManager";

export const metadata: Metadata = {
  title: "Shipments | KeebForge Admin",
  robots: { index: false, follow: false },
};

const SHIP_STATUSES: ShippingStatus[] = [
  "NOT_DISPATCHED",
  "DISPATCHED",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "RETURNED",
];

const SHIP_STATUS_LABELS: Record<ShippingStatus, string> = {
  NOT_DISPATCHED: "Not dispatched",
  DISPATCHED: "Dispatched",
  IN_TRANSIT: "In transit",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  RETURNED: "Returned",
};

export default async function AdminShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requirePermission("order", "view");
  const sp = await searchParams;
  const status = SHIP_STATUSES.includes(sp.status as ShippingStatus)
    ? (sp.status as ShippingStatus)
    : undefined;
  const rows = await getAdminShipments({ status });

  const shipRows: ShipmentRow[] = rows.map((s) => ({
    id: s.id,
    courier: s.courier,
    trackingNumber: s.trackingNumber,
    status: s.status,
    pickupId: s.pickupId,
    createdAt: s.createdAt.toISOString(),
    order: {
      orderNumber: s.order.orderNumber,
      customerName: s.order.customerName,
      customerEmail: s.order.customerEmail,
      shippingDestinationPincode: s.order.shippingDestinationPincode,
    },
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <h1
        style={{
          fontFamily: "var(--ff-display)",
          fontSize: "1.35rem",
          fontWeight: 700,
          letterSpacing: "-0.02em",
        }}
      >
        Shipments{" "}
        <span className="muted num">
          ({rows.length}
          {!status ? " active" : ""})
        </span>
      </h1>

      <ShipmentsManager
        key={status ?? "active"}
        rows={shipRows}
        status={status}
      />
    </div>
  );
}
