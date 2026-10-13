"use client";

import { useState } from "react";
import {
  ActionForm,
  Spinner,
  type ActionState,
} from "@/components/admin/ActionForm";
import { toggleEmailNotification } from "@/app/admin/actions/settings";
import {
  EMAIL_LABELS,
  EMAIL_TYPES,
  isEmailTypeLocked,
  resolveEmailEnabled,
  type EmailSettingsRead,
  type EmailType,
} from "@/lib/email/email-policy";

type Badge = "REQUIRED" | "CORE" | "OPTIONAL";

const META: Record<EmailType, { description: string; badge?: Badge }> = {
  passwordReset: {
    description:
      "Password reset link. Required for account recovery — keep enabled.",
    badge: "REQUIRED",
  },
  emailVerification: {
    description:
      "Verification link sent on sign-up and from the resend action on /auth/error.",
    badge: "CORE",
  },
  contactInquiry: {
    description:
      "Internal notification to contact@keebforge.in when the contact form is submitted.",
    badge: "OPTIONAL",
  },
  repairRequest: {
    description:
      "Internal notification to contact@keebforge.in when a custom work / repair request is submitted.",
    badge: "OPTIONAL",
  },
  shopOrderPaid: {
    description:
      "Order confirmation sent to the customer after a shop order is paid.",
    badge: "CORE",
  },
  modsOrderPaid: {
    description:
      "Order confirmation sent to the customer after a custom work (mods) order is paid.",
    badge: "CORE",
  },
  guestOrderConfirmation: {
    description:
      "Extra gate for paid confirmations on guest (account-less) orders. Core shop/mods toggles still apply.",
    badge: "OPTIONAL",
  },
};

const BADGE_STYLE: Record<Badge, { color: string; background: string }> = {
  REQUIRED: { color: "#0b0e14", background: "var(--err)" },
  CORE: { color: "#0b0e14", background: "var(--acc)" },
  OPTIONAL: { color: "var(--t2)", background: "var(--bg3)" },
};

function EmailToggleRow({
  type,
  enabled: initialEnabled,
}: {
  type: EmailType;
  enabled: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const meta = META[type];
  const badge = meta.badge ? BADGE_STYLE[meta.badge] : null;
  const locked = isEmailTypeLocked(type);

  const runAction = async (_prev: ActionState, formData: FormData) => {
    const result = await toggleEmailNotification(_prev, formData);
    if (result?.ok) setEnabled((prev) => !prev);
    return result;
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
        padding: "14px 16px",
        borderRadius: "var(--r-sm)",
        border: "1px solid var(--bdr)",
        background: enabled ? "var(--bg2)" : "var(--bg3)",
      }}
    >
      <div style={{ flex: 1, minWidth: 240 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontSize: "0.84rem",
              fontWeight: 700,
              color: "var(--t1)",
            }}
          >
            {EMAIL_LABELS[type]}
          </span>
          {meta.badge && badge && (
            <span
              style={{
                fontSize: "0.58rem",
                fontWeight: 700,
                letterSpacing: "0.08em",
                padding: "2px 7px",
                borderRadius: "var(--r-sm)",
                color: badge.color,
                background: badge.background,
                whiteSpace: "nowrap",
              }}
            >
              {meta.badge}
            </span>
          )}
        </div>
        <p
          style={{
            fontSize: "0.74rem",
            color: "var(--t3)",
            lineHeight: 1.45,
            marginBottom: 0,
          }}
        >
          {meta.description}
        </p>
      </div>

      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}
      >
        {locked ? (
          <span
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              padding: "4px 10px",
              borderRadius: "var(--r-sm)",
              border: "1px solid var(--bdr)",
              color: "var(--ok)",
              background: "var(--bg3)",
              whiteSpace: "nowrap",
            }}
          >
            ALWAYS ON
          </span>
        ) : (
          <>
            <span
              style={{
                fontSize: "0.72rem",
                fontWeight: 700,
                letterSpacing: "0.04em",
                color: enabled ? "var(--ok)" : "var(--t3)",
                whiteSpace: "nowrap",
              }}
            >
              {enabled ? "● ON" : "● OFF"}
            </span>

            <ActionForm
              action={runAction}
              label={(s) => s.message ?? "Email setting saved"}
            >
              {(pending) => (
                <>
                  <input type="hidden" name="type" value={type} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={enabled ? "false" : "true"}
                  />
                  <button
                    type="submit"
                    className={`btn-admin ${enabled ? "sm danger" : "sm primary"}`}
                    disabled={pending}
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {pending ? <Spinner /> : enabled ? "Disable" : "Enable"}
                  </button>
                </>
              )}
            </ActionForm>
          </>
        )}
      </div>
    </div>
  );
}

export function EmailNotificationsCard({ read }: { read: EmailSettingsRead }) {
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
          TRANSACTIONAL EMAIL
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--t3)" }}>
          Each toggle is consulted immediately before the send.
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {EMAIL_TYPES.map((type) => (
          <EmailToggleRow
            key={type}
            type={type}
            enabled={resolveEmailEnabled(type, read)}
          />
        ))}
      </div>
    </div>
  );
}
