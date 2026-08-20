"use client";

import { ActionForm, Spinner } from "@/components/admin/ActionForm";
import { importProducts } from "@/app/admin/actions/catalog";

export function ImportForm() {
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <h3 style={{ marginBottom: 0 }}>CSV import</h3>
      <ActionForm action={importProducts} toastLabel="Import">
        {(pending) => (
          <div className="admin-grid" style={{ gridTemplateColumns: "1fr", gap: 10, maxWidth: 480 }}>
            <input type="file" name="file" accept=".csv,text/csv" required disabled={pending} className="input" />
            <button type="submit" className="btn-admin primary" disabled={pending}>{pending ? <Spinner /> : "Import CSV"}</button>
          </div>
        )}
      </ActionForm>
    </div>
  );
}