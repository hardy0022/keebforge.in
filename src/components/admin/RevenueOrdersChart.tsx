"use client";

type Point = { label: string; revenue: number; orders: number };

/** Minimal dual-series time series chart (SVG, no dependencies). */
export function RevenueOrdersChart({ data, maxRevenue, maxOrders }: { data: Point[]; maxRevenue: number; maxOrders: number }) {
  const W = 800;
  const H = 220;
  const PAD = { top: 14, right: 10, bottom: 22, left: 10 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const n = data.length;
  const stepX = n > 1 ? innerW / (n - 1) : 0;
  const x = (i: number) => PAD.left + i * stepX;
  const yRevenue = (v: number) => PAD.top + innerH - (maxRevenue > 0 ? (v / maxRevenue) * innerH : 0);
  const yOrders = (v: number) => PAD.top + innerH - (maxOrders > 0 ? (v / maxOrders) * innerH : 0);

  if (n === 0) return null;

  const revenuePath = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${yRevenue(p.revenue)}`).join(" ");
  const ordersPath = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${yOrders(p.orders)}`).join(" ");

  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Revenue and orders over time">
      {gridLines.map((f) => {
        const y = PAD.top + innerH - f * innerH;
        return (
          <line
            key={f}
            x1={PAD.left}
            y1={y}
            x2={W - PAD.right}
            y2={y}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
        );
      })}

      {data.length > 0 && (
        <path d={revenuePath} fill="none" stroke="var(--acc, #c9f31d)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      )}
      {data.length > 0 && (
        <path d={ordersPath} fill="none" stroke="var(--purple, #7c6ff2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray="4 3" />
      )}

      {data.map((p, i) =>
        p.revenue > 0 ? (
          <circle key={`r${i}`} cx={x(i)} cy={yRevenue(p.revenue)} r="2.5" fill="var(--acc, #c9f31d)">
            <title>{`${p.label} · ${p.revenue > 0 ? "₹" + (p.revenue / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 }) : "₹0"}`}</title>
          </circle>
        ) : null
      )}
      {data.map((p, i) =>
        p.orders > 0 ? (
          <circle key={`o${i}`} cx={x(i)} cy={yOrders(p.orders)} r="2.5" fill="var(--purple, #7c6ff2)">
            <title>{`${p.label} · ${p.orders} orders`}</title>
          </circle>
        ) : null
      )}

      {n > 0 &&
        data
          .map((p, i) => ({ p, i }))
          .filter(({ i }) => i % Math.ceil(n / 8) === 0 || i === n - 1)
          .map(({ p, i }) => (
            <text key={`t${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--t3, #9494a6)">
              {p.label}
            </text>
          ))}
    </svg>
  );
}
