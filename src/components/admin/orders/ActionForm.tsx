"use client";

import { useActionState } from "react";
import type { ReactNode } from "react";
import type { ActionState } from "@/app/admin/actions/orders";

export { Spinner } from "@/components/admin/ActionForm";

export function Toast({
  state,
  okLabel,
}: {
  state: ActionState;
  okLabel: string;
}) {
  const ok = state.ok === true;
  const err =
    state.error ?? (state.ok === false ? "Something went wrong." : "");
  if (!ok && !err) return null;
  return (
    <div
      className={`kf-toast ${ok ? "ok" : "err"}`}
      role={ok ? "status" : "alert"}
    >
      {ok ? `✓ ${okLabel}` : `✕ ${err}`}
    </div>
  );
}

export function ActionForm({
  action,
  okLabel,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  okLabel: string | ((state: ActionState) => string);
  children: (pending: boolean, state: ActionState) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const label = typeof okLabel === "function" ? okLabel(state) : okLabel;
  return (
    <>
      <Toast state={state} okLabel={label} />
      <form action={formAction}>{children(pending, state)}</form>
    </>
  );
}
