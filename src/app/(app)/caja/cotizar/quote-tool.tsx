"use client";

import { useActionState, useMemo, useState } from "react";
import { profitOf, quoteFromTiers } from "@/lib/bulk";
import { fmtCOP, fmtPct } from "@/lib/format";
import type { Settings } from "@/lib/settings-defaults";
import { PrintTicket } from "@/components/ticket";
import { registerBulkSale, type BulkState } from "./actions";
import type { PublicQuoteItem as QuoteItem } from "./data";

const strip = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (v: string) => Number(v.replace(",", ".")) || 0;
const QUICK = [1, 2, 3, 5, 10];

export function QuoteTool({ items, settings, isAdmin }: { items: QuoteItem[]; settings: Settings; isAdmin: boolean }) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<QuoteItem | null>(null);
  const [kgText, setKgText] = useState("1");
  const [total, setTotal] = useState("");
  const [state, action, pending] = useActionState<BulkState, FormData>(registerBulkSale, {});

  const matches = useMemo(() => {
    const q = strip(query.trim());
    if (!q || picked?.name === query) return [];
    return items.filter((i) => strip(i.name).includes(q)).slice(0, 8);
  }, [query, items, picked]);

  const kg = num(kgText);
  const quote = picked && kg > 0 ? quoteFromTiers(picked, kg, settings) : null;
  const finalTotal = num(total.replace(/\./g, "")) || quote?.total || 0;
  const belowFloor = quote ? finalTotal < quote.floorTotal : false;
  const shortStock = picked?.stockKg !== null && picked?.stockKg !== undefined && kg > picked.stockKg;

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <label className="block">
          <span className="label">¿Qué producto pide el cliente?</span>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
            placeholder="Escribe: linaza, chía, almendra…"
            className="input text-lg"
            autoComplete="off"
          />
        </label>
        {matches.length > 0 && (
          <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
            {matches.map((i) => (
              <li key={i.familyId}>
                <button type="button" onClick={() => { setPicked(i); setQuery(i.name); setTotal(""); }} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]">
                  <span className="font-medium">{i.name}</span>
                  <span className="text-xs text-muted">{i.stockKg !== null ? `${i.stockKg.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg disponibles` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div>
          <span className="label">¿Cuántos kilos?</span>
          <div className="flex flex-wrap items-center gap-2">
            {QUICK.map((q) => (
              <button key={q} type="button" onClick={() => { setKgText(String(q)); setTotal(""); }} className={kg === q ? "btn-primary" : "btn-secondary"}>{q} kg</button>
            ))}
            <button type="button" onClick={() => { setKgText("25"); setTotal(""); }} className={kg === 25 ? "btn-primary" : "btn-secondary"}>Bulto 25 kg</button>
            <input value={kgText} onChange={(e) => { setKgText(e.target.value); setTotal(""); }} inputMode="decimal" className="input w-24" aria-label="Kilos" />
            <span className="text-sm text-muted">kg</span>
          </div>
        </div>
      </section>

      {picked && !quote && <p className="card text-sm">Este producto no tiene costo cargado todavía, así que no se puede cotizar.</p>}

      {picked && quote && (
        <section className="card space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm text-muted">{quote.tierLabel} · {kg.toLocaleString("es-CO")} kg de {picked.name}</p>
              <p className="text-4xl font-bold tracking-tight tabular-nums">{fmtCOP(quote.total)}</p>
              <p className="text-sm">{fmtCOP(quote.pricePerKg)} por kilo{picked.ivaRate > 0 ? ` (IVA ${fmtPct(picked.ivaRate)} incluido)` : ""}</p>
            </div>
            {quote.retailTotal && quote.savings !== null && quote.savings > 0 && (
              <div className="rounded-xl px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>
                En bolsas pagaría {fmtCOP(quote.retailTotal)}.<br />
                <strong>Ahorra {fmtCOP(quote.retailTotal - quote.total)} ({fmtPct(quote.savings)})</strong>
              </div>
            )}
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p className="rounded-xl bg-[var(--surface-2)] px-3 py-2">
              Precio mínimo si el cliente negocia: <strong>{fmtCOP(quote.floorTotal)}</strong> ({fmtCOP(quote.floorPerKg)}/kg). No bajes de ahí.
            </p>
            <p className="rounded-xl bg-[var(--surface-2)] px-3 py-2">
              Disponible: <strong>{picked.stockKg !== null ? `${picked.stockKg.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg` : "sin conteo"}</strong>
              {shortStock && <span style={{ color: "var(--bad)" }}> · no alcanza para {kg} kg</span>}
            </p>
            {isAdmin && picked.costPerKg !== undefined && (
              <ProfitTable
                rows={[
                  { label: "Precio sugerido", gross: quote.total },
                  ...(total && finalTotal !== quote.total ? [{ label: "Precio que escribiste", gross: finalTotal }] : []),
                  { label: "Precio mínimo", gross: quote.floorTotal },
                ]}
                ivaRate={picked.ivaRate}
                cost={picked.costPerKg * kg}
                note={`Costo ${fmtCOP(picked.costPerKg)}/kg sin IVA × ${kg.toLocaleString("es-CO")} kg${quote.cappedByRetail ? " · precio ajustado para no superar el de bolsas" : ""}`}
              />
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <PrintTicket
              label="Imprimir cotización"
              data={{
                title: "COTIZACIÓN",
                date: new Date().toLocaleDateString("es-CO"),
                items: [{ name: picked.name, detail: `${kg.toLocaleString("es-CO")} kg × ${fmtCOP(quote.pricePerKg)}`, total: quote.total }],
                totals: [{ label: "TOTAL", value: fmtCOP(quote.total), big: true }],
                footer: "Precio válido solo el día de hoy. Incluye IVA.",
              }}
            />
            <span className="text-xs text-muted">Para entregarle al cliente el precio por escrito.</span>
          </div>

          <form action={action} className="space-y-3 border-t border-[var(--border)] pt-4">
            <h3 className="font-semibold">¿El cliente lo lleva?</h3>
            <input type="hidden" name="familyId" value={picked.familyId} />
            <input type="hidden" name="kg" value={kg} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="label">Valor final que paga (con IVA)</span>
                <input value={total} onChange={(e) => setTotal(e.target.value)} placeholder={String(quote.total)} inputMode="numeric" className="input" />
              </label>
              <label>
                <span className="label">Cliente (opcional)</span>
                <input name="customer" placeholder="Nombre o empresa" className="input" />
              </label>
            </div>
            <input type="hidden" name="total" value={finalTotal} />
            {belowFloor && (
              <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
                Está por debajo del precio mínimo{isAdmin ? "; como administrador puedes registrarlo igual." : ". Pide autorización a Luis o Paula."}
              </p>
            )}
            <button className="btn-primary" disabled={pending || (belowFloor && !isAdmin)}>
              {pending ? "Registrando…" : `Registrar venta y descontar ${kg.toLocaleString("es-CO")} kg del inventario`}
            </button>
            <p className="text-xs text-muted">
              Después factúralo en Vendty con el producto «{picked.name} x kg» (cantidad {kg.toLocaleString("es-CO")}, precio por kilo{" "}
              {fmtCOP(Math.round(finalTotal / (kg || 1)))}). Si no existe en Vendty, créalo una sola vez con unidad kilo.
            </p>
          </form>
        </section>
      )}

      {state.ok && (
        <div className="space-y-2">
          <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--good-bg)", color: "var(--good)" }}>{state.ok}</p>
          {state.receipt && (
            <PrintTicket
              label="Imprimir recibo de la venta"
              className="btn-primary"
              data={{
                title: "RECIBO DE VENTA",
                number: `G-${state.receipt.id}`,
                date: new Date(state.receipt.date + "T12:00:00").toLocaleDateString("es-CO"),
                rows: [...(state.receipt.customer ? [{ label: "Cliente", value: state.receipt.customer }] : []), { label: "Atendió", value: state.receipt.seller }],
                items: [{ name: state.receipt.product, detail: `${state.receipt.kg.toLocaleString("es-CO")} kg × ${fmtCOP(state.receipt.perKg)}`, total: state.receipt.total }],
                totals: [{ label: "TOTAL", value: fmtCOP(state.receipt.total), big: true }],
              }}
            />
          )}
        </div>
      )}
      {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
    </div>
  );
}

/** Solo administradores: cuánto queda de cada precio después de IVA y costo. */
function ProfitTable({ rows, ivaRate, cost, note }: { rows: { label: string; gross: number }[]; ivaRate: number; cost: number; note: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] sm:col-span-2">
      <table className="table-base">
        <thead>
          <tr><th>Utilidad (solo administradores)</th><th className="text-right">Venta sin IVA</th><th className="text-right">Costo</th><th className="text-right">Utilidad</th><th className="text-right">Margen</th><th className="text-right">Sobre costo</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const u = profitOf(r.gross, ivaRate, cost);
            return (
              <tr key={r.label}>
                <td>{r.label} <span className="text-muted">({fmtCOP(r.gross)})</span></td>
                <td className="text-right">{fmtCOP(u.net)}</td>
                <td className="text-right">{fmtCOP(u.cost)}</td>
                <td className="text-right font-semibold" style={{ color: u.profit < 0 ? "var(--bad)" : "var(--good)" }}>{fmtCOP(u.profit)}</td>
                <td className="text-right font-semibold">{fmtPct(u.margin)}</td>
                <td className="text-right">{fmtPct(u.markup)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 pb-2 text-xs text-muted">{note}. Margen = utilidad ÷ venta sin IVA; sobre costo = utilidad ÷ costo.</p>
    </div>
  );
}
