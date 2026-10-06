"use client";

import { useActionState } from "react";
import { applySachetRule, archiveTinySachets, createMissingSachets, type SachetState } from "./actions";

export function SachetActions() {
  const [rule, runRule, rulePending] = useActionState<SachetState>(applySachetRule, {});
  const [missing, runMissing, missingPending] = useActionState<SachetState>(createMissingSachets, {});
  const [tiny, runTiny, tinyPending] = useActionState<SachetState>(archiveTinySachets, {});
  const box = (s: SachetState) =>
    s.ok || s.error ? <p className="rounded-lg px-3 py-2 text-sm" style={s.error ? { background: "var(--bad-bg)", color: "var(--bad)" } : { background: "var(--good-bg)", color: "var(--good)" }}>{s.error ?? s.ok}</p> : null;
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={runMissing}><button className="btn-secondary" disabled={missingPending}>{missingPending ? "Creando…" : "Crear los sachets que faltan"}</button></form>
        <form action={runRule}><button className="btn-primary" disabled={rulePending}>{rulePending ? "Aplicando…" : "Aplicar la regla a todos los sachets"}</button></form>
        <form action={runTiny}><button className="btn-secondary" disabled={tinyPending}>{tinyPending ? "Archivando…" : "Archivar los de menos de 5 g"}</button></form>
      </div>
      {box(missing)}{box(tiny)}
      {box(rule)}
    </section>
  );
}
