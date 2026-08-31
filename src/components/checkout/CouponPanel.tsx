"use client";

import { useState } from "react";
import { formatINR } from "@/lib/money";

export type AppliedCoupon = { code: string; discount: number; label?: string };

/**
 * Shared coupon UI for both checkouts. Owns the apply/remove interaction and
 * calls the validate endpoint for the current subtotal; the parent keeps the
 * applied coupon and sends its code with the order-creation request.
 *
 * Presentational only — validation, discount math and order logic are unchanged.
 */
export function CouponPanel({
  subtotalPaise,
  coupon,
  setCoupon,
}: {
  subtotalPaise: number;
  coupon: AppliedCoupon | null;
  setCoupon: (c: AppliedCoupon | null) => void;
}) {
  const [code, setCode] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "applied" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function apply() {
    const trimmed = code.trim();
    if (!trimmed) return;
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: trimmed, subtotalPaise }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setState("error");
        setError(data.error ?? "That coupon code isn't valid.");
        return;
      }
      setCoupon({
        code: data.code,
        discount: data.discount,
        label: `${formatINR(data.discount)} off`,
      });
      setState("applied");
    } catch {
      setState("error");
      setError("Could not reach the server. Try again.");
    }
  }

  function remove() {
    setCoupon(null);
    setCode("");
    setState("idle");
    setError(null);
  }

  return (
    <div className="coupon-section">
      {coupon ? (
        <>
          <p className="coupon-heading">Coupon applied</p>
          <div className="coupon-applied">
            <div className="coupon-applied-row">
              <span className="coupon-check">✓</span>
              <span className="coupon-code">{coupon.code}</span>
              <button type="button" className="coupon-remove" onClick={remove}>
                Remove
              </button>
            </div>
            <p className="coupon-desc">
              {coupon.label ?? `${formatINR(coupon.discount)} off`}
              <span className="coupon-amount">−{formatINR(coupon.discount)}</span>
            </p>
          </div>
        </>
      ) : (
        <>
          <p className="coupon-heading">Have a coupon?</p>
          <div className="coupon-row">
            <div className="coupon-input-wrap">
              <svg
                className="coupon-icon"
                viewBox="0 0 24 24"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <circle cx="7" cy="7" r=".5" fill="currentColor" />
              </svg>
              <input
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setState("idle");
                  setError(null);
                }}
                placeholder="Enter coupon code"
                className="coupon-input"
                disabled={state === "loading"}
              />
            </div>
            <button
              type="button"
              onClick={() => void apply()}
              disabled={state === "loading" || !code.trim()}
              className="coupon-apply"
            >
              {state === "loading" ? "…" : "Apply"}
            </button>
          </div>
          {state === "error" && error && (
            <p className="coupon-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
