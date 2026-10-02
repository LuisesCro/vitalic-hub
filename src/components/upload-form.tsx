"use client";

import { useActionState } from "react";
import { FilePicker } from "./file-picker";

type State = { ok?: string; error?: string };

export function UploadForm({
  action,
  accept,
  button,
}: {
  action: (prev: State, formData: FormData) => Promise<State>;
  accept: string;
  button: string;
}) {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});
  return (
    <form action={formAction} className="space-y-3">
      <FilePicker accept={accept} />
      <button className="btn-primary" disabled={pending}>
        {pending ? "Procesando…" : button}
      </button>
      {state.ok && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>{state.ok}</p>}
      {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
    </form>
  );
}
