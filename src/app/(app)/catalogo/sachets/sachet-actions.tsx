"use client";

import { useActionState } from "react";
import { applySachetRule, archiveTinySachets, createMissingSachets, setSachetPrice, unifyDuplicateSachets, type SachetState } from "./actions";

export function SachetActions({ price }: { price: number }) {
  const [priced, runPrice, pricePending] = useActionState<SachetState, FormData>(setSachetPrice, {});
  const [rule, runRule, rulePending] = useActionState<SachetState>(applySachetRule, {});
  const [missing, runMissing, missingPending] = useActionState<SachetState>(createMissingSachets, {});
  const [tiny, runTiny, tinyPending] = useActionState<SachetState>(archiveTinySachets, {});
  const [dups, runDups, dupsPending] = useActionState<SachetState>(unifyDuplicateSachets, {});
  const box = (s: SachetState) =>
    s.ok || s.error ? <p className="rounded-lg px-3 py-2 text-sm" style={s.error ? { background: "var(--bad-bg)", color: "var(--bad)" } : { background: "var(--good-bg)", color: "var(--good)" }}>{s.error ?? s.ok}</p> : null;
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={runMissing}><button className="btn-secondary" disabled={missingPending}>{missingPending ? "Creando…" : "Crear los sachets que faltan"}</button></form>
        <form action={runRule}><button className="btn-primary" disabled={rulePending}>{rulePending ? "Aplicando…" : "Aplicar la regla a todos los sachets"}</button></form>
        <form action={runTiny}><button className="btn-secondary" disabled={tinyPending}>{tinyPending ? "Archivando…" : "Archivar los de menos de 5 g"}</button></form>
        <form action={runDups}><button className="btn-secondary" disabled={dupsPending}>{dupsPending ? "Unificando…" : "Unir sachets repetidos"}</button></form>
      </div>
      <form action={runPrice} className="flex flex-wrap items-end gap-2">
        <label><span className="label">Precio de todos los sachets (con IVA)</span><input name="price" inputMode="numeric" defaultValue={price} className="input w-32" /></label>
        <button className="btn-primary" disabled={pricePending}>{pricePending ? "Cambiando…" : "Cambiar el precio de todos"}</button>
      </form>
      {box(priced)}{box(missing)}{box(tiny)}{box(dups)}
      {box(rule)}
    </section>
  );
}
