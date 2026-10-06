"use client";

import { useActionState } from "react";
import { deductSalesFromInventory, type DeductState } from "./actions";

export function DeductForm({ from, to }: { from: string; to: string }) {
  const [state, action, pending] = useActionState<DeductState, FormData>(deductSalesFromInventory, {});
  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label><span className="label">Desde</span><input type="date" name="from" defaultValue={from} className="input" required /></label>
        <label><span className="label">Hasta</span><input type="date" name="to" defaultValue={to} className="input" required /></label>
        <button className="btn-primary" disabled={pending}>{pending ? "Descontando…" : "Descontar del inventario"}</button>
      </div>
      {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
      {state.ok && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>{state.ok}</p>}
    </form>
  );
}
