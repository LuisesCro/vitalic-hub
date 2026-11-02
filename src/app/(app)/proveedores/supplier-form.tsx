"use client";

import { useActionState } from "react";
import { saveSupplier, type SupplierState } from "./actions";

type Initial = { id?: number; name: string; nit: string; phone: string; notes: string };

export function SupplierForm({ initial, button }: { initial?: Initial; button: string }) {
  const [state, action, pending] = useActionState<SupplierState, FormData>(saveSupplier, {});
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      {initial?.id && <input type="hidden" name="id" value={initial.id} />}
      <label><span className="label">Nombre</span><input name="name" required defaultValue={initial?.name} className="input" placeholder="Productos 3A" /></label>
      <label><span className="label">NIT (sin dígito de verificación)</span><input name="nit" inputMode="numeric" defaultValue={initial?.nit} className="input" /></label>
      <label><span className="label">Teléfono o WhatsApp</span><input name="phone" defaultValue={initial?.phone} className="input" /></label>
      <label><span className="label">Qué nos vende / notas</span><input name="notes" defaultValue={initial?.notes} className="input" placeholder="Miel, plazo de pago, vendedor…" /></label>
      <div className="sm:col-span-2 flex items-center gap-3">
        <button className="btn-primary" disabled={pending}>{pending ? "Guardando…" : button}</button>
        {state.ok && <span className="text-sm" style={{ color: "var(--good)" }}>{state.ok}</span>}
        {state.error && <span className="text-sm" style={{ color: "var(--bad)" }}>{state.error}</span>}
      </div>
    </form>
  );
}
