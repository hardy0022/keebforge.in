"use client";

import { useActionState } from "react";

export type ActionState = { ok?: boolean; error?: string; message?: string; id?: string };

export function ActionForm({
  action,
  toastLabel,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  toastLabel: string;
  children: (pending: boolean, state: ActionState) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <>
      {state.ok !== undefined && (
        <div className={`kf-toast ${state.ok ? "ok" : "err"}`} role="status">
          {state.ok ? `✓ ${state.message ?? `${toastLabel} saved`}` : "✕ Unable to save"}
        </div>
      )}
      {state.error && !state.ok && <p style={{ color: "var(--err)", fontSize: "0.8rem" }}>{state.error}</p>}
      <form action={formAction}>{children(pending, state)}</form>
    </>
  );
}

export const Spinner = ({ light = false }: { light?: boolean }) => <span className={`spinner ${light ? "light" : ""}`} aria-hidden />;