"use client";

import { useRef, useState } from "react";
import { ActionForm, Spinner, type ActionState } from "@/components/admin/ActionForm";
import { toggleMaintenanceMode } from "@/app/admin/actions/settings";
import type { Environment } from "@/lib/environment";

export function MaintenanceModeCard({
  environment,
  name,
  url,
  enabled: initialEnabled,
  prominent,
  confirmationTitle,
  confirmationBody,
  confirmationNote,
}: {
  environment: Environment;
  name: string;
  url: string;
  enabled: boolean;
  prominent?: boolean;
  confirmationTitle: string;
  confirmationBody: string;
  confirmationNote: string;
}) {
  const isProduction = environment === "production";
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

  const envColor = isProduction ? "var(--warn)" : "#5b8cff";

  return (
    <>
      <div
        className="admin-card"
        style={{
          maxWidth: "100%",
          ...(prominent
            ? { borderColor: "var(--warn)", boxShadow: "0 0 0 1px var(--warn), 0 8px 30px -12px color-mix(in srgb, var(--warn) 40%, transparent)" }
            : {}),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <span
              style={{
                fontSize: "0.62rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "3px 8px",
                borderRadius: "var(--r-sm)",
                color: "#0b0e14",
                background: envColor,
                whiteSpace: "nowrap",
              }}
            >
              {isProduction ? "PRODUCTION" : "DEVELOPMENT"}
            </span>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--t1)", letterSpacing: "0.04em" }}>{name}</span>
          </div>
          <span style={{ fontSize: "0.72rem", color: "var(--t3)" }}>{url}</span>
        </div>

        <div
          style={{
            padding: "14px 16px",
            borderRadius: "var(--r-sm)",
            border: "1px solid var(--bdr)",
            background: enabled ? "var(--acc-dim)" : "var(--bg3)",
          }}
        >
          <div className="kf-settings-status" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: "0.78rem", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--t3)", marginBottom: 6 }}>
                Current status
              </p>
              <p style={{ fontSize: "0.9rem", fontWeight: 700, color: enabled ? "var(--acc)" : "var(--ok)", marginBottom: 0 }}>
                {enabled ? "● MAINTENANCE" : "● ONLINE"}
              </p>
            </div>

            <p style={{ fontSize: "0.72rem", color: "var(--t3)", marginBottom: 0, maxWidth: 240, lineHeight: 1.4, textAlign: "right" }}>
              {isProduction
                ? "Controls the live production website only."
                : "Controls the local development website only."}
            </p>

            <ActionForm action={runAction} toastLabel="Maintenance mode">
              {(pending) => (
                <>
                  <input type="hidden" name="environment" value={environment} />
                  {enabled ? (
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
                  )}
                </>
              )}
            </ActionForm>
          </div>
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
              {confirmationTitle}
            </h3>
            <p style={{ fontSize: "0.84rem", color: "var(--t2)", lineHeight: 1.55, marginBottom: 8 }}>
              {confirmationBody} Admins will still be able to access the admin panel.
            </p>
            <p style={{ fontSize: "0.84rem", fontWeight: 600, color: envColor, lineHeight: 1.5, marginBottom: 20 }}>
              {confirmationNote}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button ref={cancelRef} type="button" className="btn-admin sm" onClick={() => setConfirming(false)}>
                Cancel
              </button>
              <ActionForm action={runAction} toastLabel="Maintenance mode">
                {(pending) => (
                  <>
                    <input type="hidden" name="environment" value={environment} />
                    <button type="submit" className="btn-admin sm primary" disabled={pending}>
                      {pending ? <Spinner /> : "Enable Maintenance"}
                    </button>
                  </>
                )}
              </ActionForm>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
