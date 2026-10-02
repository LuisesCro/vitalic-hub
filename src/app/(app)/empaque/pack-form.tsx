"use client";

import { useActionState } from "react";
import { recordPackaging, type PackState } from "./actions";

export function PackForm({ products, today }: { products: { id: number; name: string }[]; today: string }) {
  const [state, action, pending] = useActionState<PackState, FormData>(recordPackaging, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-4">
      <label className="sm:col-span-2">
        <span className="label">Producto</span>
        <select name="productId" required className="input">
          <option value="">Elige…</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label><span className="label">Bolsas</span><input name="bags" type="number" min={1} required className="input" /></label>
      <label><span className="label">Merma (g)</span><input name="waste" inputMode="decimal" defaultValue="0" className="input" /></label>
      <label><span className="label">Fecha</span><input name="date" type="date" defaultValue={today} required className="input" /></label>
      <div className="flex items-end"><button className="btn-primary" disabled={pending}>{pending ? "Guardando…" : "Registrar empaque"}</button></div>
      {state.ok && <p className="text-sm text-green-700 dark:text-green-400 sm:col-span-4">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-600 sm:col-span-4">{state.error}</p>}
    </form>
  );
}
