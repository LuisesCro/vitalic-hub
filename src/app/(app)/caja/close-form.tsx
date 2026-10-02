"use client";

import { useActionState, useState } from "react";
import { DENOMINATIONS, PAYMENT_METHODS, differenceStatus, sumDenominations, type PaymentKey } from "@/lib/cash";
import { fmtCOP } from "@/lib/format";
import { closeCash, type CloseState } from "./actions";

const digits = (v: string) => Number(v.replace(/[^0-9]/g, "")) || 0;

export function CloseForm({
  sessionId,
  openingCash,
  movementsNet,
  suggested,
}: {
  sessionId: number;
  openingCash: number;
  movementsNet: number;
  suggested: Partial<Record<PaymentKey, number>>;
}) {
  const [state, action, pending] = useActionState<CloseState, FormData>(closeCash, {});
  const [sales, setSales] = useState<Record<string, string>>(() =>
    Object.fromEntries(PAYMENT_METHODS.map((m) => [m.key, suggested[m.key] ? String(Math.round(suggested[m.key]!)) : ""])),
  );
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [typedTotal, setTypedTotal] = useState("");

  const countsNum = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, digits(v)]));
  const byBills = sumDenominations(countsNum);
  const counted = byBills > 0 ? byBills : typedTotal ? digits(typedTotal) : null;
  const totalSales = PAYMENT_METHODS.reduce((t, m) => t + digits(sales[m.key] ?? ""), 0);
  const expected = openingCash + digits(sales.salesCash ?? "") + movementsNet;
  const diff = counted === null ? null : counted - expected;
  const status = diff === null ? null : differenceStatus(diff);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div>
        <h3 className="mb-1 font-semibold">1. Ventas del día por medio de pago</h3>
        <p className="mb-2 text-sm text-muted">Cópialas del cierre de caja de Vendty (valores con IVA, lo que pagó el cliente).</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {PAYMENT_METHODS.map((m) => (
            <label key={m.key}>
              <span className="label">{m.label}</span>
              <input
                name={m.key}
                inputMode="numeric"
                className="input"
                placeholder="0"
                value={sales[m.key]}
                onChange={(e) => setSales({ ...sales, [m.key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm">Total vendido: <strong>{fmtCOP(totalSales)}</strong></p>
      </div>

      <div>
        <h3 className="mb-1 font-semibold">2. Cuenta el efectivo del cajón</h3>
        <p className="mb-2 text-sm text-muted">Cantidad de billetes y monedas de cada valor. Si prefieres, escribe solo el total abajo.</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {DENOMINATIONS.map((d) => (
            <label key={d}>
              <span className="label">{fmtCOP(d)}</span>
              <input
                name={`d${d}`}
                inputMode="numeric"
                className="input"
                placeholder="0"
                value={counts[d] ?? ""}
                onChange={(e) => setCounts({ ...counts, [d]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="label">Total contado (si no cuentas por billetes)</span>
            <input
              name="countedCash"
              inputMode="numeric"
              className="input"
              placeholder={byBills > 0 ? fmtCOP(byBills) : "0"}
              disabled={byBills > 0}
              value={byBills > 0 ? "" : typedTotal}
              onChange={(e) => setTypedTotal(e.target.value)}
            />
          </label>
          <label>
            <span className="label">Efectivo que queda como base para mañana</span>
            <input name="nextBase" inputMode="numeric" className="input" placeholder={fmtCOP(openingCash)} />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg border border-[var(--border)] p-3 text-sm">
        <div><p className="label">Debería haber</p><p className="font-semibold">{fmtCOP(expected)}</p></div>
        <div><p className="label">Contado</p><p className="font-semibold">{fmtCOP(counted)}</p></div>
        <div>
          <p className="label">Diferencia</p>
          <p className={`font-semibold ${status === "falta" ? "text-red-600" : status === "sobra" ? "text-amber-600" : status === "cuadra" ? "text-green-700 dark:text-green-400" : ""}`}>
            {diff === null ? "—" : `${fmtCOP(diff)} ${status === "cuadra" ? "· cuadra" : status === "falta" ? "· falta" : "· sobra"}`}
          </p>
        </div>
      </div>

      <label className="block">
        <span className="label">Nota (opcional)</span>
        <input name="note" className="input" placeholder="Ej.: faltante por vuelto mal dado" />
      </label>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Cerrando…" : "Cerrar caja"}</button>
    </form>
  );
}
