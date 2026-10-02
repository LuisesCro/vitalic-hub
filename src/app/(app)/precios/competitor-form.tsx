"use client";

import { useActionState } from "react";
import { uploadCompetitorCatalog, type CompetitorState } from "./actions";

export function CompetitorForm() {
  const [state, action, pending] = useActionState<CompetitorState, FormData>(uploadCompetitorCatalog, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <label><span className="label">Competidor</span><input name="competitor" required placeholder="El Edén" className="input" /></label>
      <label className="sm:col-span-2"><span className="label">Catálogo (Excel o CSV con columnas Producto y Precio)</span>
        <input type="file" name="file" accept=".xlsx,.xls,.csv" required className="input" /></label>
      <div><button className="btn-primary" disabled={pending}>{pending ? "Procesando…" : "Cargar y recalcular precios"}</button></div>
      {state.ok && <p className="text-sm text-green-700 dark:text-green-400 sm:col-span-3">{state.ok}</p>}
      {state.error && <p className="text-sm text-red-600 sm:col-span-3">{state.error}</p>}
    </form>
  );
}
