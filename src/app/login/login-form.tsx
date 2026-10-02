"use client";

import { useActionState, useState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  // Controlado para que el correo no se borre cuando la contraseña es incorrecta.
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="space-y-4">
      <label className="block">
        <span className="label">Correo</span>
        <input name="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
      </label>
      <label className="block">
        <span className="label">Contraseña</span>
        <input name="password" type="password" required autoComplete="current-password" className="input" />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn-primary w-full">
        {pending ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
