"use client";

import { useActionState } from "react";
import { FilePicker } from "@/components/file-picker";
import { uploadReferencePrices, type RefState } from "./actions";

export function ReferenceForm({ suppliers }: { suppliers: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState<RefState, FormData>(uploadReferencePrices, {});
  return (
    <form action={action} className="space-y-3">
      <label className="block max-w-sm"><span className="label">Proveedor</span>
        <select name="supplierId" required defaultValue="" className="input">
          <option value="" disabled>Escoge el proveedor…</option>
          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <FilePicker accept="image/*,.pdf" hint="Foto o PDF de una cotización o factura anterior" />
      <button className="btn-primary" disabled={pending}>{pending ? "Leyendo…" : "Leer y guardar precios"}</button>
      {state.ok && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>{state.ok}</p>}
      {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
    </form>
  );
}
