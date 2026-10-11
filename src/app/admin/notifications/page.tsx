import Link from "next/link";
import type { Metadata } from "next";
import { requirePermission } from "@/lib/auth/admin";
import { listOrderNotificationsNeedingAttention } from "@/lib/notifications/send-paid-confirmation";
import { fmtIST } from "@/lib/utils/ist";
import {
  NotificationsManager,
  type AttentionItem,
} from "./NotificationsManager";

export const metadata: Metadata = {
  title: "Notifications | KeebForge Admin",
  robots: { index: false, follow: false },
};

export default async function AdminNotificationsPage() {
  await requirePermission("order", "view");

  const rows = await listOrderNotificationsNeedingAttention();
  const items: AttentionItem[] = rows.map((row) => ({
    orderId: row.orderId,
    orderNumber: row.orderNumber,
    status: row.status,
    planKind: row.planKind,
    attempts: row.attempts,
    lastError: row.lastError,
    updatedAtLabel: fmtIST(new Date(row.updatedAt), {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1
          style={{
            fontFamily: "var(--ff-display)",
            fontSize: "1.35rem",
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Notifications <span className="muted num">({items.length})</span>
        </h1>
        <p className="muted" style={{ fontSize: "0.8rem", marginTop: 4 }}>
          Paid-order confirmation emails. The send path is conservative: it
          never re-sends an ambiguous outcome. Reconcile a stuck record here
          after checking the Resend dashboard, or backfill orders whose
          confirmation row was never written. Nothing on this page emails a
          customer unless you explicitly send or retry.
        </p>
      </div>

      <NotificationsManager items={items} />

      <Link href="/admin" className="muted" style={{ fontSize: "0.75rem" }}>
        ← Dashboard
      </Link>
    </div>
  );
}
