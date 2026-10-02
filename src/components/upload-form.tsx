"use client";

import { useActionState } from "react";

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
      <input type="file" name="file" accept={accept} required className="input" />
      <button className="btn-primary" disabled={pending}>
        {pending ? "Procesando…" : button}
      </button>
      {state.ok && <p className="text-sm text-green-700 dark:text-green-400">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
