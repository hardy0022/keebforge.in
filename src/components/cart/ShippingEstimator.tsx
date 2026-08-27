"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatINR } from "@/lib/money";

type EstimateState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "quote"; amount: number }
  | { kind: "unavailable" }
  | { kind: "error" };

const PINCODE_RE = /^[1-9]\d{5}$/;

/**
 * Pincode → Delhivery shipping charge, shown near the order total.
 * Weight/origin/payment-mode are resolved server-side from the live cart;
 * this component only sends the destination pincode.
 */
export function ShippingEstimator({ cartSignature }: { cartSignature: string }) {
  const [pincode, setPincode] = useState("");
  const [state, setState] = useState<EstimateState>({ kind: "idle" });
  const [quotedPin, setQuotedPin] = useState<string | null>(null);
  // Guards against duplicate simultaneous requests for the same calculation.
  const inflight = useRef(false);
  const lastArgs = useRef("");

  const calculate = useCallback(
    async (pin: string) => {
      const argsKey = `${pin}|${cartSignature}`;
      if (inflight.current && lastArgs.current === argsKey) return;
      lastArgs.current = argsKey;

      inflight.current = true;
      setState({ kind: "loading" });
      try {
        const res = await fetch("/api/shipping/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinationPincode: pin }),
        });
        const data = (await res.json().catch(() => null)) as { success?: boolean; shipping?: { amount: number }; errorCode?: string } | null;
        if (data?.success && data.shipping) {
          setState({ kind: "quote", amount: data.shipping.amount });
          setQuotedPin(pin);
        } else if (data?.errorCode === "PINCODE_UNAVAILABLE") {
          setState({ kind: "unavailable" });
        } else {
          setState({ kind: "error" });
        }
      } catch {
        setState({ kind: "error" });
      } finally {
        inflight.current = false;
      }
    },
    [cartSignature],
  );

  // Recalculate when the cart changes (qty/content) after a quote exists.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (PINCODE_RE.test(pincode)) void calculate(pincode);
  }, [calculate, pincode]);

  const canSubmit = PINCODE_RE.test(pincode) && state.kind !== "loading";

  return (
    <div className="border-t border-dashed border-[var(--bdr)] pt-3 mt-3">
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-[var(--t3)]">Shipping</span>
        {state.kind === "quote" ? (
          <span className="font-display font-bold text-[var(--t1)]">{formatINR(state.amount)}</span>
        ) : (
          <span className="text-xs text-[var(--t3)]">
            {state.kind === "loading"
              ? "Calculating shipping..."
              : state.kind === "unavailable"
                ? "Shipping unavailable for this pincode"
                : state.kind === "error"
                  ? "Unable to calculate shipping right now."
                  : "Enter your pincode to calculate shipping"}
          </span>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) void calculate(pincode);
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          placeholder="6-digit pincode"
          className="shop-field w-full"
          value={pincode}
          onChange={(e) => {
            const next = e.target.value.replace(/\D/g, "").slice(0, 6);
            setPincode(next);
            // A changed pincode invalidates the previous quote immediately.
            if (quotedPin && next !== quotedPin) setState({ kind: "idle" });
          }}
          aria-label="Delivery pincode"
        />
        <button type="submit" className="btn-ghost shrink-0" style={{ width: "auto", paddingInline: 16 }} disabled={!canSubmit}>
          Calculate
        </button>
      </form>
    </div>
  );
}
