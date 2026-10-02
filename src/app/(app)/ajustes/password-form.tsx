"use client";

import { useActionState } from "react";
import { changePassword, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState<PasswordState, FormData>(changePassword, {});
  return (
    <form action={action} className="card grid gap-3 sm:grid-cols-3">
      <h2 className="font-semibold sm:col-span-3">Cambiar mi clave</h2>
      <label><span className="label">Clave actual</span><input name="current" type="password" required autoComplete="current-password" className="input" /></label>
      <label><span className="label">Clave nueva (mínimo 10 caracteres)</span><input name="next" type="password" required autoComplete="new-password" className="input" /></label>
      <label><span className="label">Repetir clave nueva</span><input name="repeat" type="password" required autoComplete="new-password" className="input" /></label>
      <div className="sm:col-span-3"><button className="btn-primary" disabled={pending}>{pending ? "Guardando…" : "Cambiar clave"}</button></div>
      {state.ok && <p className="text-sm text-green-700 dark:text-green-400 sm:col-span-3">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-600 sm:col-span-3">{state.error}</p>}
    </form>
  );
}
