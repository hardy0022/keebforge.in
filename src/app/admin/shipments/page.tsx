import Link from "next/link";
import type { Metadata } from "next";
import type { ShippingStatus } from "@prisma/client";
import { requirePermission } from "@/lib/auth/admin";
import { getAdminShipments } from "@/lib/admin";
import { AdminPagination } from "@/components/admin/AdminPagination";
import { parsePage } from "@/lib/admin/pagination";
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission("order", "view");
  const sp = await searchParams;
  const rawStatus = typeof sp.status === "string" ? sp.status : sp.status?.[0];
  const status = SHIP_STATUSES.includes(rawStatus as ShippingStatus)
    ? (rawStatus as ShippingStatus)
    : undefined;
  const result = await getAdminShipments({
    status,
    page: parsePage(typeof sp.page === "string" ? sp.page : sp.page?.[0]),
  });

  const shipRows: ShipmentRow[] = result.items.map((s) => ({
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
          ({result.total}
          {!status ? " active" : ""})
        </span>
      </h1>

      <ShipmentsManager
        // Selection is page-scoped: the bulk "book pickup" action posts the ids
        // of the rows on screen, so reset it when the page or status changes
        // (same reset-on-status-change behaviour as before).
        key={`${status ?? "active"}:${result.page}`}
        rows={shipRows}
        status={status}
      />

      <AdminPagination
        page={result.page}
        pages={result.pages}
        total={result.total}
        searchParams={sp}
        basePath="/admin/shipments"
        unit="shipments"
      />
    </div>
  );
}
