"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";

export type ActionState = {
  ok?: boolean;
  error?: string;
  message?: string;
  id?: string;
};

/** Fixed top-right toast (auto-dismisses). Used standalone where a form owns
 *  its own useActionState, and by ActionForm for success feedback. */
export function Toast({
  state,
  label,
}: {
  state: Pick<ActionState, "ok" | "error">;
  label: string;
}) {
  const ok = state.ok === true;
  const err = state.error ?? (state.ok === false ? "Something went wrong." : "");
  if (!ok && !err) return null;
  return (
    <div
      className={`kf-toast ${ok ? "ok" : "err"}`}
      role={ok ? "status" : "alert"}
    >
      {ok ? `✓ ${label}` : `✕ ${err}`}
    </div>
  );
}

export function ActionForm({
  action,
  label,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  /** Success message; a function receives the settled state to embed a message. */
  label: string | ((state: ActionState) => string);
  children: (pending: boolean, state: ActionState) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const text = typeof label === "function" ? label(state) : label;
  return (
    <>
      {state.ok === true && (
        <div className="kf-toast ok" role="status">
          ✓ {text}
        </div>
      )}
      {state.error && !state.ok && (
        <p style={{ color: "var(--err)", fontSize: "0.8rem" }} role="alert">
          {state.error}
        </p>
      )}
      <form action={formAction}>{children(pending, state)}</form>
    </>
  );
}

export const Spinner = ({ light = false }: { light?: boolean }) => (
  <span className={`spinner ${light ? "light" : ""}`} aria-hidden />
);