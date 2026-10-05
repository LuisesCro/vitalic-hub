"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { PrintTicket } from "@/components/ticket";
import { fmtCOP } from "@/lib/format";
import { POS_METHODS, type PosMethod } from "@/lib/pos";
import { returnSale, type ReturnState } from "./actions";
import type { SaleLineInfo } from "./data";

const METHODS: PosMethod[] = ["efectivo", "tarjeta", "nequi", "daviplata", "breb", "transferencia"];
const qtyText = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 3 });

/** Devolución parcial de una venta: eliges cuánto de cada línea vuelve y por qué medio se devuelve el dinero. */
export function ReturnForm({ saleId, number, lines, defaultMethod }: { saleId: number; number: string; lines: SaleLineInfo[]; defaultMethod: PosMethod }) {
  const [state, action, pending] = useActionState<ReturnState, FormData>(returnSale, {});
  const [qty, setQty] = useState<Record<number, string>>({});
  const [method, setMethod] = useState<PosMethod>(defaultMethod);
  const [reason, setReason] = useState("");
  const printed = useRef<number | null>(null);

  const remaining = (l: SaleLineInfo) => Math.max(0, Math.round((l.quantity - l.returned) * 1000) / 1000);
  const items = lines.flatMap((l) => {
    const q = Number((qty[l.id] ?? "").replace(",", ".")) || 0;
    return q > 0 ? [{ lineId: l.id, qty: Math.min(q, remaining(l)) }] : [];
  });
  const refund = items.reduce((t, it) => {
    const l = lines.find((x) => x.id === it.lineId)!;
    return t + Math.round((l.unit * l.quantity * it.qty) / l.quantity);
  }, 0);
  const payload = JSON.stringify({ saleId, items, method, reason });

  useEffect(() => {
    if (state.returnId && state.returnId !== printed.current) {
      printed.current = state.returnId;
      setTimeout(() => document.getElementById(`print-return-${state.returnId}`)?.click(), 150);
    }
  }, [state.returnId]);

  return (
    <details className="relative inline-block align-top">
      <summary className="cursor-pointer text-sm underline">Devolver</summary>
      <form action={action} className="card fixed inset-x-3 top-20 z-30 max-h-[80vh] space-y-3 overflow-y-auto text-left shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[26rem]">
        <input type="hidden" name="payload" value={payload} />
        <p className="font-semibold">Devolución de {number}</p>
        <ul className="divide-y divide-[var(--border)]">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate">{l.name}</span>
                <span className="block text-xs text-muted">
                  Vendido {qtyText(l.quantity)}{l.kg ? " kg" : l.byWeight ? " g" : ""}{l.returned > 0 ? ` · ya devuelto ${qtyText(l.returned)}` : ""}
                </span>
              </span>
              {remaining(l) > 0 ? (
                <span className="flex shrink-0 items-center gap-1">
                  <input
                    value={qty[l.id] ?? ""} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                    inputMode="decimal" placeholder="0" className="input w-16 py-1 text-center" aria-label={`Cantidad a devolver de ${l.name}`}
                  />
                  <button type="button" className="text-xs underline" onClick={() => setQty({ ...qty, [l.id]: String(remaining(l)) })}>todo</button>
                </span>
              ) : (
                <span className="text-xs text-muted">devuelto</span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-1.5">
          {METHODS.map((m) => (
            <button key={m} type="button" onClick={() => setMethod(m)} className={method === m ? "btn-primary px-2.5 py-1 text-xs" : "btn-secondary px-2.5 py-1 text-xs"}>{POS_METHODS[m]}</button>
          ))}
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo (opcional)" className="input" />
        <p className="text-sm">Se devuelven <strong>{fmtCOP(refund)}</strong> en {POS_METHODS[method].toLowerCase()}.</p>
        {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
        {state.returnId && state.receipt && (
          <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>
            Devolución V-{state.returnId} registrada por {fmtCOP(state.refund ?? 0)}.{" "}
            <PrintTicket id={`print-return-${state.returnId}`} data={state.receipt} label="Imprimir comprobante" className="underline" />
          </p>
        )}
        <button className="btn-primary w-full" disabled={pending || items.length === 0}>{pending ? "Registrando…" : "Registrar devolución"}</button>
      </form>
    </details>
  );
}
