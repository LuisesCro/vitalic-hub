"use client";

import { useActionState, useState } from "react";
import { PAYMENT_METHODS_SUPPLIER, type SupplierPaymentMethod } from "@/lib/payables";
import { addSupplierPayment, type PayState } from "./payments";

export function PayForm({ purchaseId, balance, today }: { purchaseId: number; balance: number; today: string }) {
  const [state, action, pending] = useActionState<PayState, FormData>(addSupplierPayment, {});
  const [method, setMethod] = useState<SupplierPaymentMethod>("transferencia");
  const [amount, setAmount] = useState(String(Math.round(balance)));
  // Con la factura saldada el formulario se oculta, pero el mensaje del último pago se mantiene a la vista.
  if (balance <= 0) {
    return state.ok ? <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>{state.ok}</p> : null;
  }
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="purchaseId" value={purchaseId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <label>
          <span className="label">Valor pagado</span>
          <input name="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="input" />
        </label>
        <label>
          <span className="label">Cómo se pagó</span>
          <select name="method" value={method} onChange={(e) => setMethod(e.target.value as SupplierPaymentMethod)} className="input">
            {(Object.keys(PAYMENT_METHODS_SUPPLIER) as SupplierPaymentMethod[]).map((m) => <option key={m} value={m}>{PAYMENT_METHODS_SUPPLIER[m]}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Fecha del pago</span>
          <input name="paidOn" type="date" defaultValue={today} max={today} className="input" />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Nota (opcional)</span>
          <input name="note" placeholder="Ej.: comprobante 4567, abono acordado" className="input" />
        </label>
        {method === "efectivo" && (
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" name="fromCash" value="1" defaultChecked /> Salió de la caja del día
          </label>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending}>{pending ? "Guardando…" : "Registrar pago"}</button>
        {String(Math.round(balance)) !== amount && (
          <button type="button" onClick={() => setAmount(String(Math.round(balance)))} className="btn-secondary">Pagar el saldo completo</button>
        )}
      </div>
      {state.ok && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>{state.ok}</p>}
      {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
    </form>
  );
}
