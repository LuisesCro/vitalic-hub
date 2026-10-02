"use client";

import { useActionState } from "react";
import { ROLE_LABELS, type Role } from "@/lib/roles";
import { createUser, resetUserPassword, updateUser, type UserState } from "./actions";

type UserRow = { id: number; name: string; email: string; role: string; active: boolean };

export function UsersPanel({ users, me }: { users: UserRow[]; me: number }) {
  const [state, action, pending] = useActionState<UserState, FormData>(createUser, {});
  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Usuarios</h2>
      <ul className="divide-y divide-[var(--border)]">
        {users.map((u) => (
          <li key={u.id} className="space-y-2 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">
                <span className="font-medium">{u.name}</span>{" "}
                <span className="break-all text-sm text-muted">{u.email}</span>
                {!u.active && <span className="ml-2 text-sm text-red-600">desactivado</span>}
              </p>
              {u.id === me ? (
                <span className="text-sm text-muted">{ROLE_LABELS[u.role as Role] ?? u.role} · tú</span>
              ) : (
                <form action={updateUser} className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="hidden" name="id" value={u.id} />
                  <select name="role" defaultValue={u.role} className="input w-auto py-1">
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <select name="active" defaultValue={u.active ? "1" : "0"} className="input w-auto py-1">
                    <option value="1">Activo</option>
                    <option value="0">Desactivado</option>
                  </select>
                  <button className="btn-secondary py-1">Guardar</button>
                </form>
              )}
            </div>
            {u.id !== me && <ResetPassword id={u.id} />}
          </li>
        ))}
      </ul>

      <form action={action} className="grid gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-2">
        <h3 className="font-semibold sm:col-span-2">Crear usuario</h3>
        <label><span className="label">Nombre</span><input name="name" required className="input" placeholder="Martha" /></label>
        <label><span className="label">Correo (con el que entra)</span><input name="email" type="email" required className="input" placeholder="martha@vitalic.co" /></label>
        <label>
          <span className="label">Rol</span>
          <select name="role" defaultValue="cajera" className="input">
            {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </label>
        <label><span className="label">Clave inicial (mínimo 10)</span><input name="password" required minLength={10} className="input" autoComplete="new-password" /></label>
        <div className="sm:col-span-2"><button className="btn-primary" disabled={pending}>{pending ? "Creando…" : "Crear usuario"}</button></div>
        {state.ok && <p className="text-sm text-green-700 dark:text-green-400 sm:col-span-2">{state.ok}</p>}
        {state.error && <p className="text-sm text-red-600 sm:col-span-2">{state.error}</p>}
      </form>
    </section>
  );
}

function ResetPassword({ id }: { id: number }) {
  const [state, action, pending] = useActionState<UserState, FormData>(resetUserPassword, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      <input name="password" minLength={10} required placeholder="Clave nueva" className="input w-48 py-1" autoComplete="new-password" />
      <button className="btn-secondary py-1" disabled={pending}>Restablecer clave</button>
      {state.ok && <span className="text-green-700 dark:text-green-400">{state.ok}</span>}
      {state.error && <span className="text-red-600">{state.error}</span>}
    </form>
  );
}
