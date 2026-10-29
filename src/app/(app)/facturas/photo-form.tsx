"use client";

import { useActionState, useRef } from "react";
import { FilePicker } from "@/components/file-picker";
import { submitInvoicePhoto, type PhotoState } from "./actions";

export function PhotoForm() {
  const [state, action, pending] = useActionState<PhotoState, FormData>(submitInvoicePhoto, {});
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <FilePicker accept="image/*" hint="Toca y toma la foto de la factura" />
      <label className="block"><span className="label">Nota (opcional)</span>
        <input name="note" className="input" placeholder="Proveedor, qué llegó, si falta una hoja…" /></label>
      <button className="btn-primary" disabled={pending}>{pending ? "Enviando…" : "Enviar factura"}</button>
      {state.ok && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>{state.ok}</p>}
      {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
    </form>
  );
}
