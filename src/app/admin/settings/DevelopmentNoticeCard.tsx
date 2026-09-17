"use client";

import { useState } from "react";
import {
  ActionForm,
  Spinner,
  type ActionState,
} from "@/components/admin/ActionForm";
import { toggleDevelopmentNotice } from "@/app/admin/actions/settings";

export function DevelopmentNoticeCard({
  enabled: initialEnabled,
}: {
  enabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);

  const runAction = async (_prev: ActionState, formData: FormData) => {
    const result = await toggleDevelopmentNotice(_prev, formData);
    if (result?.ok) setEnabled((prev) => !prev);
    return result;
  };

  return (
    <div className="admin-card" style={{ maxWidth: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: "0.78rem",
            fontWeight: 700,
            color: "var(--t1)",
            letterSpacing: "0.04em",
          }}
        >
          SITE-WIDE DEVELOPMENT NOTICE
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--t3)" }}>
          keebforge.in
        </span>
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderRadius: "var(--r-sm)",
          border: "1px solid var(--bdr)",
          background: enabled
            ? "color-mix(in srgb, var(--warn) 12%, transparent)"
            : "var(--bg3)",
        }}
      >
        <div
          className="kf-settings-status"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <p
              style={{
                fontSize: "0.78rem",
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--t3)",
                marginBottom: 6,
              }}
            >
              Current status
            </p>
            <p
              style={{
                fontSize: "0.9rem",
                fontWeight: 700,
                color: enabled ? "var(--warn)" : "var(--t3)",
                marginBottom: 0,
              }}
            >
              {enabled ? "● SHOWING" : "● HIDDEN"}
            </p>
          </div>

          <p
            style={{
              fontSize: "0.72rem",
              color: "var(--t3)",
              marginBottom: 0,
              maxWidth: 300,
              lineHeight: 1.4,
              textAlign: "right",
            }}
          >
            Shows a banner telling visitors the site is under development and to
            shop at shop.keebforge.in if they have trouble.
          </p>

          <ActionForm
            action={runAction}
            label={(s) => s.message ?? "Development notice saved"}
          >
            {(pending) => (
              <>
                <input
                  type="hidden"
                  name="enabled"
                  value={enabled ? "false" : "true"}
                />
                <button
                  type="submit"
                  className={`btn-admin ${enabled ? "sm danger" : "primary"}`}
                  disabled={pending}
                  style={{ whiteSpace: "nowrap" }}
                >
                  {pending ? (
                    <Spinner />
                  ) : enabled ? (
                    "Disable Notice"
                  ) : (
                    "Enable Notice"
                  )}
                </button>
              </>
            )}
          </ActionForm>
        </div>
      </div>
    </div>
  );
}