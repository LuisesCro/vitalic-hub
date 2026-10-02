"use client";

import { useActionState } from "react";
import { FilePicker } from "@/components/file-picker";
import { uploadCompetitorCatalog, type CompetitorState } from "./actions";

export function CompetitorForm() {
  const [state, action, pending] = useActionState<CompetitorState, FormData>(uploadCompetitorCatalog, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <label><span className="label">Competidor</span><input name="competitor" required placeholder="El Edén" className="input" /></label>
      <div className="sm:col-span-2"><span className="label">Catálogo</span>
        <FilePicker accept=".xlsx,.xls,.csv" hint="Excel o CSV con columnas Producto y Precio" /></div>
      <div><button className="btn-primary" disabled={pending}>{pending ? "Procesando…" : "Cargar y recalcular precios"}</button></div>
      {state.ok && <p className="rounded-lg px-3 py-2 text-sm sm:col-span-3" style={{ background: "var(--good-bg)", color: "var(--good)" }}>{state.ok}</p>}
      {state.error && <p className="rounded-lg px-3 py-2 text-sm sm:col-span-3" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
    </form>
  );
}
