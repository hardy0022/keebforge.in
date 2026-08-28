"use client";

import { useState } from "react";
import { deleteWork, moveWork, toggleWork } from "@/app/admin/actions/work";

type Row = {
  id: string;
  title: string;
  slug: string;
  category: string;
  date: string | null;
  active: boolean;
  featured: boolean;
  sortOrder: number;
  imageCount: number;
};

function label(cat: string): string {
  return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function WorkList({ rows }: { rows: Row[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const firstId = rows[0]?.id;
  const lastId = rows[rows.length - 1]?.id;

  async function run(id: string, fn: () => Promise<unknown>) {
    if (busy) return;
    setBusy(id);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="admin-card" style={{ padding: 8 }}>
      <div style={{ overflowX: "auto" }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Project</th>
              <th>Category</th>
              <th>Date</th>
              <th>Photos</th>
              <th>Status</th>
              <th>Order</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ width: 64 }}>
                  <span className={`badge ${r.active ? "badge-ok" : "badge-warn"}`}>{r.active ? "Live" : "Draft"}</span>
                </td>
                <td style={{ minWidth: 200 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.82rem" }}>
                    {r.title}
                    {r.featured && <span className="badge" style={{ marginLeft: 6 }}>★</span>}
                  </div>
                  <div className="muted" style={{ fontSize: "0.75rem" }}>
                    /work/{r.slug} · order {r.sortOrder}
                  </div>
                </td>
                <td className="muted">{label(r.category)}</td>
                <td className="muted">{r.date ?? "—"}</td>
                <td className="num">{r.imageCount}</td>
                <td>
                  <button
                    type="button"
                    className="btn-admin"
                    style={{ fontSize: "0.72rem", padding: "3px 8px" }}
                    disabled={busy === r.id}
                    onClick={() => run(r.id, () => toggleWork(r.id, !r.active))}
                  >
                    {r.active ? "Unpublish" : "Publish"}
                  </button>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                    <button
                      type="button"
                      className="btn-admin"
                      aria-label="Move up"
                      disabled={busy === r.id || r.id === firstId}
                      onClick={() => run(r.id, () => moveWork(r.id, -1))}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="btn-admin"
                      aria-label="Move down"
                      disabled={busy === r.id || r.id === lastId}
                      onClick={() => run(r.id, () => moveWork(r.id, 1))}
                    >
                      ↓
                    </button>
                  </div>
                </td>
                <td>
                  <div style={{ display: "flex", gap: 6 }}>
                    <a className="btn-admin" href={`/admin/work/${r.id}`}>
                      Edit
                    </a>
                    <button
                      type="button"
                      className="btn-admin"
                      style={{ color: "var(--err)" }}
                      disabled={busy === r.id}
                      onClick={() => {
                        if (window.confirm(`Delete "${r.title}" permanently?`)) run(r.id, () => deleteWork(r.id));
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}