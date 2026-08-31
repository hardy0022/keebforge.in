"use client";

import { useRef, useState } from "react";
import { ActionForm, Spinner, type ActionState } from "@/components/admin/ActionForm";
import { toggleMaintenanceMode } from "@/app/admin/actions/settings";

export function MaintenanceModeCard({
  enabled: initialEnabled,
  isProduction,
  siteName,
}: {
  enabled: boolean;
  isProduction: boolean;
  siteName: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [confirming, setConfirming] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const runAction = async (_prev: ActionState, formData: FormData) => {
    const result = await toggleMaintenanceMode(_prev, formData);
    if (result?.ok) {
      setEnabled((prev) => !prev);
      setConfirming(false);
    }
    return result;
  };

  return (
    <>
      <div className="admin-card" style={{ maxWidth: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ marginBottom: 6 }}>Website Maintenance</h3>
            <p style={{ fontSize: "0.82rem", color: "var(--t2)", lineHeight: 1.5, marginBottom: 0 }}>
              Control public access to KeebForge while maintenance or
              <br />
              updates are being performed.
            </p>
          </div>
          <span
            className={`badge ${enabled ? "badge-lime" : ""}`}
            style={
              enabled
                ? { fontSize: "0.72rem", padding: "4px 11px" }
                : { fontSize: "0.72rem", padding: "4px 11px", color: "var(--t3)", borderColor: "var(--bdr)", background: "var(--bg3)" }
            }
          >
            {enabled ? "● ON" : "● OFF"}
          </span>
        </div>

        <div
          style={{
            marginTop: 20,
            padding: "14px 16px",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--bdr)",
            background: enabled ? "var(--acc-dim)" : "var(--bg3)",
          }}
        >
          <div className="kf-settings-status" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: "0.78rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>
                Website status
              </p>
              <p style={{ fontSize: "0.85rem", color: enabled ? "var(--acc)" : "var(--t1)", fontWeight: 600, marginBottom: 0 }}>
                {enabled ? "● Maintenance" : "● Online"}
              </p>
            </div>

            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "0.78rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>
                Environment
              </p>
              <p
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  marginBottom: 0,
                  color: isProduction ? "var(--warn)" : "#5b8cff",
                }}
              >
                {isProduction ? "PRODUCTION" : "DEVELOPMENT"} · {siteName}
              </p>
            </div>

            <ActionForm action={runAction} toastLabel="Maintenance mode">
              {(pending) =>
                enabled ? (
                  <button type="submit" className="btn-admin sm danger" disabled={pending} style={{ whiteSpace: "nowrap" }}>
                    {pending ? <Spinner /> : "Disable Maintenance"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-admin primary"
                    disabled={pending}
                    style={{ whiteSpace: "nowrap" }}
                    onClick={() => setConfirming(true)}
                  >
                    Enable Maintenance
                  </button>
                )
              }
            </ActionForm>
          </div>
        </div>

        <div
          style={{
            marginTop: 18,
            display: "flex",
            gap: 24,
            flexWrap: "wrap",
            fontSize: "0.78rem",
            color: "var(--t2)",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--t3)" }}>Public website</span>
            <span className={`badge ${enabled ? "badge-warn" : "badge-ok"}`} style={{ fontSize: "0.62rem", padding: "2px 8px" }}>
              {enabled ? "Maintenance" : "Available"}
            </span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "var(--t3)" }}>Admin panel</span>
            <span className="badge badge-ok" style={{ fontSize: "0.62rem", padding: "2px 8px" }}>
              Available
            </span>
          </span>
        </div>
      </div>

      {confirming && !enabled && (
        <div
          className="kf-settings-overlay"
          onClick={() => setConfirming(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="mm-modal-title"
        >
          <div className="kf-settings-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="mm-modal-title" style={{ fontFamily: "var(--ff-display)", fontSize: "1rem", fontWeight: 700, marginBottom: 10 }}>
              Enable maintenance mode?
            </h3>
            <p style={{ fontSize: "0.84rem", color: "var(--t2)", lineHeight: 1.55, marginBottom: 20 }}>
              Visitors will temporarily be unable to access{" "}
              <span style={{ fontWeight: 600, color: isProduction ? "var(--warn)" : "#5b8cff" }}>
                {isProduction ? "PRODUCTION" : "DEVELOPMENT"} · {siteName}
              </span>
              . Admins will still be able to access the admin panel.
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                ref={cancelRef}
                type="button"
                className="btn-admin sm"
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <ActionForm action={runAction} toastLabel="Maintenance mode">
                {(pending) => (
                  <button type="submit" className="btn-admin sm primary" disabled={pending}>
                    {pending ? <Spinner /> : "Enable Maintenance"}
                  </button>
                )}
              </ActionForm>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
