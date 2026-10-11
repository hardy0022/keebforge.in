import Image from "next/image";
import Link from "next/link";
import type { OrderStatus, OrderType } from "@prisma/client";
import { formatINR } from "@/lib/utils/money";
import {
  ORDER_STATUS_CHIP,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
} from "@/lib/orders";

/** The slice of an order the card renders. `services`/`repairs` are optional so
 *  the overview (which only loads product lines) can reuse the same card. */
export type AccountOrder = {
  id: string;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  total: number;
  createdAt: Date;
  items: { name: string; quantity: number; imageUrl: string | null }[];
  services?: { name: string; quantity: number }[];
  repairs?: { deviceType: string }[];
};

export function formatOrderDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * One order as a product card. Server component, no state — the only client
 * behaviour is the two existing links.
 */
export function OrderCard({ order }: { order: AccountOrder }) {
  // The first line headlines the order; the rest stay as secondary lines.
  // Services/repairs carry no image, so they fall back to the shop's initial tile.
  const lines = [
    ...order.items.map((i) => ({
      name: i.name,
      qty: i.quantity,
      image: i.imageUrl,
    })),
    ...(order.services ?? []).map((s) => ({
      name: s.name,
      qty: s.quantity,
      image: null,
    })),
    ...(order.repairs ?? []).map((r) => ({
      name: `${r.deviceType} Repair`,
      qty: 1,
      image: null,
    })),
  ];
  const lead = lines[0];
  const more = lines.slice(1, 3);
  const extra = lines.length - 1 - more.length;

  return (
    <article className="account-order-card">
      <div className="account-order-media">
        {lead?.image ? (
          <Image
            src={lead.image}
            alt={lead.name}
            fill
            sizes="(min-width: 861px) 152px, (min-width: 641px) 132px, 110px"
            className="account-order-img"
          />
        ) : (
          <span
            className="shop-card-fallback account-order-fallback"
            aria-hidden="true"
          >
            {Array.from(lead?.name ?? "K")[0]}
          </span>
        )}
      </div>

      <div className="account-order-body">
        <h3 className="account-order-title">
          {lead?.name ?? ORDER_TYPE_LABELS[order.type]}
        </h3>

        <div className="account-order-card-id">
          <span className="account-order-number-label">Order</span>
          <Link
            href={`/order/success/${order.orderNumber}`}
            className="account-order-number is-link"
          >
            {order.orderNumber}
          </Link>
        </div>

        {more.length > 0 && (
          <div className="account-order-items-preview">
            {more.map((line, i) => (
              <span key={i} className="account-order-item-name">
                {line.name}
                {line.qty > 1 ? ` ×${line.qty}` : ""}
              </span>
            ))}
            {extra > 0 && (
              <span className="account-order-more">+{extra} more</span>
            )}
          </div>
        )}

        <span className="account-order-total">{formatINR(order.total)}</span>
      </div>

      <span className="account-order-date">
        {formatOrderDate(order.createdAt)}
      </span>

      {/* Its own grid row, so the divider spans the full card width rather
          than stopping at the text column. */}
      <div className="account-order-card-foot">
        <span
          className={`account-order-status ${ORDER_STATUS_CHIP[order.status]}`}
        >
          {ORDER_STATUS_LABELS[order.status]}
        </span>
        <div className="account-order-actions">
          <Link
            href={`/order/success/${order.orderNumber}`}
            className="btn-ghost btn-sm"
          >
            Summary
          </Link>
          <Link
            href={`/track-order?order=${order.orderNumber}`}
            className="btn-prime btn-sm"
          >
            Track →
          </Link>
        </div>
      </div>
    </article>
  );
}
