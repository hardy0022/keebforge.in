"use client";

import { useState } from "react";
import { ActionForm, Spinner } from "@/components/admin/ActionForm";
import { saveCoupon, toggleCoupon, deleteCoupon } from "@/app/admin/actions/coupons";
import { formatINR } from "@/lib/money";

type CouponRow = {
  id: string;
  code: string;
  type: "PERCENT" | "FIXED";
  value: number;
  minOrder: number | null;
  maxDiscount: number | null;
  active: boolean;
  usageLimit: number | null;
  usedCount: number;
  perCustomerLimit: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  _count: { usages: number };
};

type FormState = {
  code: string;
  type: "PERCENT" | "FIXED";
  value: string;
  minOrder: string;
  maxDiscount: string;
  usageLimit: string;
  perCustomerLimit: string;
  startsAt: string;
  expiresAt: string;
};

const EMPTY_FORM: FormState = {
  code: "",
  type: "PERCENT",
  value: "",
  minOrder: "",
  maxDiscount: "",
  usageLimit: "",
  perCustomerLimit: "",
  startsAt: "",
  expiresAt: "",
};

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

function formFromCoupon(c: CouponRow): FormState {
  return {
    code: c.code,
    type: c.type,
    value: c.type === "PERCENT" ? String(c.value) : String(c.value / 100),
    minOrder: c.minOrder == null ? "" : String(c.minOrder / 100),
    maxDiscount: c.maxDiscount == null ? "" : String(c.maxDiscount / 100),
    usageLimit: c.usageLimit == null ? "" : String(c.usageLimit),
    perCustomerLimit: c.perCustomerLimit == null ? "" : String(c.perCustomerLimit),
    startsAt: toDateInput(c.startsAt),
    expiresAt: toDateInput(c.expiresAt),
  };
}

export function CouponsManager({ coupons }: { coupons: CouponRow[] }) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(coupons.length === 0);

  const reset = () => {
    setForm({ ...EMPTY_FORM });
    setEditId(null);
  };

  const openCreate = () => {
    reset();
    setShowForm(true);
  };

  const openEdit = (c: CouponRow) => {
    setForm(formFromCoupon(c));
    setEditId(c.id);
    setShowForm(true);
  };

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {!showForm && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <button type="button" className="btn-admin primary" onClick={openCreate}>
            + Create coupon
          </button>
          {coupons.length > 0 && (
            <span className="muted" style={{ fontSize: "0.8rem" }}>{coupons.length} coupon{coupons.length === 1 ? "" : "s"}</span>
          )}
        </div>
      )}

      {showForm && (
        <div className="admin-card">
          <h3 style={{ marginBottom: 14 }}>{editId ? "Edit coupon" : "Create coupon"}</h3>
          <ActionForm action={saveCoupon} toastLabel="Coupon">
            {(pending, state) => (
              <>
                {state.error && !state.ok && <p style={{ color: "var(--err)", fontSize: "0.8rem", marginBottom: 10 }}>{state.error}</p>}

                {editId && <input type="hidden" name="id" value={editId} />}

                <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                  <div>
                    <p className="admin-label" style={{ marginBottom: 10 }}>Coupon</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                      <label className="admin-label" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        Code
                        <input
                          name="code"
                          className="input"
                          value={form.code}
                          onChange={set("code")}
                          placeholder="e.g. WELCOME10"
                          style={{ textTransform: "uppercase", marginTop: 6 }}
                          maxLength={40}
                        />
                      </label>
                      <label className="admin-label" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        Discount type
                        <select className="input" name="type" value={form.type} onChange={set("type")} style={{ marginTop: 6 }}>
                          <option value="PERCENT">Percent (%)</option>
                          <option value="FIXED">Fixed (₹)</option>
                        </select>
                      </label>
                      <label className="admin-label" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        Discount value
                        <input className="input" name="value" value={form.value} onChange={set("value")} placeholder={form.type === "PERCENT" ? "e.g. 10" : "e.g. 500"} style={{ marginTop: 6 }} />
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="admin-label" style={{ marginBottom: 10 }}>Rules</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                      <label className="admin-label" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        Minimum order (₹)
                        <input className="input" name="minOrder" value={form.minOrder} onChange={set("minOrder")} placeholder="optional" style={{ marginTop: 6 }} />
                      </label>
                      <label className="admin-label" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        Maximum discount (₹)
                        <input className="input" name="maxDiscount" value={form.maxDiscount} onChange={set("maxDiscount")} placeholder="optional" style={{ marginTop: 6 }} />
                      </label>
                      <label className="admin-label" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        Usage limit
                        <input className="input" name="usageLimit" value={form.usageLimit} onChange={set("usageLimit")} placeholder="optional" style={{ marginTop: 6 }} />
                      </label>
                      <label className="admin-label" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        Per-customer limit
                        <input className="input" name="perCustomerLimit" value={form.perCustomerLimit} onChange={set("perCustomerLimit")} placeholder="optional" style={{ marginTop: 6 }} />
                      </label>
                    </div>
                  </div>

                  <div>
                    <p className="admin-label" style={{ marginBottom: 10 }}>Validity</p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14 }}>
                      <label className="admin-label" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        Starts (date)
                        <input type="date" className="input" name="startsAt" value={form.startsAt} onChange={set("startsAt")} style={{ marginTop: 6 }} />
                      </label>
                      <label className="admin-label" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                        Expires (date)
                        <input type="date" className="input" name="expiresAt" value={form.expiresAt} onChange={set("expiresAt")} style={{ marginTop: 6 }} />
                      </label>
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
                  <button type="submit" className="btn-admin primary" disabled={pending}>
                    {pending ? <Spinner /> : editId ? "Update coupon" : "Create coupon"}
                  </button>
                  <button type="button" className="btn-admin sm" onClick={() => { reset(); setShowForm(false); }}>Cancel</button>
                </div>
              </>
            )}
          </ActionForm>
        </div>
      )}

      <div className="admin-card" style={{ overflow: "auto" }}>
        <table className="admin-table" style={{ width: "100%" }}>
          <thead>
            <tr>
              <th>Code</th>
              <th>Type</th>
              <th>Value</th>
              <th>Min order</th>
              <th>Usage</th>
              <th>Valid</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((c) => {
              const expiry = c.expiresAt ? new Date(c.expiresAt) : null;
              const started = c.startsAt ? new Date(c.startsAt) : null;
              const now = new Date();
              const valid = !expiry || expiry >= now;
              const notStarted = started ? started > now : false;
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 700 }}>{c.code}</td>
                  <td>{c.type === "PERCENT" ? "%" : "₹"}</td>
                  <td>{c.type === "PERCENT" ? `${c.value}%` : formatINR(c.value)}</td>
                  <td>{c.minOrder == null ? "—" : formatINR(c.minOrder)}</td>
                  <td>{c.usedCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td>
                  <td>
                    {notStarted
                      ? `Starts ${started!.toLocaleDateString()}`
                      : valid
                        ? expiry
                          ? `Until ${expiry.toLocaleDateString()}`
                          : "No expiry"
                        : "Expired"}
                  </td>
                  <td>
                    <span className={`badge ${c.active ? "badge-ok" : ""}`} style={{ fontSize: "0.65rem", padding: "2px 8px" }}>
                      {c.active ? (notStarted ? "Scheduled" : "Active") : "Disabled"}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <ActionForm action={toggleCoupon} toastLabel="Coupon status">
                        {(innerPending) => (
                          <>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="btn-admin sm" disabled={innerPending}>
                              {innerPending ? <Spinner /> : c.active ? "Disable" : "Enable"}
                            </button>
                          </>
                        )}
                      </ActionForm>
                      <button type="button" className="btn-admin sm" onClick={() => openEdit(c)}>
                        Edit
                      </button>
                      <ActionForm action={deleteCoupon} toastLabel="Coupon">
                        {(innerPending) => (
                          <>
                            <input type="hidden" name="id" value={c.id} />
                            {c._count.usages > 0 && <input type="hidden" name="force" value="true" />}
                            <button
                              type="submit"
                              className="btn-admin sm danger"
                              disabled={innerPending}
                              onClick={(e) => {
                                if (c._count.usages > 0) {
                                  const ok = window.confirm(
                                    `"${c.code}" was used on ${c._count.usages} order(s). Deleting it will remove its usage history. Continue?`,
                                  );
                                  if (!ok) e.preventDefault();
                                }
                              }}
                            >
                              {innerPending ? <Spinner /> : c._count.usages > 0 ? "Delete anyway" : "Delete"}
                            </button>
                          </>
                        )}
                      </ActionForm>
                    </div>
                  </td>
                </tr>
              );
            })}
            {coupons.length === 0 && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: "center" }}>No coupons created yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
