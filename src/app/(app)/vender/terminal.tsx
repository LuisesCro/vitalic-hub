"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { PrintTicket, type TicketData } from "@/components/ticket";
import { fmtCOP } from "@/lib/format";
import { POS_METHODS, cartTotals, lineGross, quickCash, settle, type PosMethod } from "@/lib/pos";
import { createSale, type SaleState } from "./actions";
import type { PosProduct } from "./data";

type CartLine = { product: PosProduct; quantity: number };
type PayRow = { key: number; method: PosMethod; amount: string };

const strip = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
const METHOD_ORDER: PosMethod[] = ["efectivo", "tarjeta", "nequi", "daviplata", "breb", "transferencia"];

export function PosTerminal({ products, quick, isAdmin }: { products: PosProduct[]; quick: number[]; isAdmin: boolean }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState<PayRow[]>([{ key: 1, method: "efectivo", amount: "" }]);
  const [discount, setDiscount] = useState("");
  const [customer, setCustomer] = useState("");
  const [autoPrint, setAutoPrint] = useState(true);
  const [state, action, pending] = useActionState<SaleState, FormData>(createSale, {});
  const searchRef = useRef<HTMLInputElement>(null);
  const lastPrinted = useRef<number | null>(null);
  const keySeq = useRef(1);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const matches = useMemo(() => {
    const q = strip(query.trim());
    if (!q) return [];
    const words = q.split(/\s+/);
    return products.filter((p) => { const hay = strip(`${p.name} ${p.sku}`); return words.every((w) => hay.includes(w)); }).slice(0, 14);
  }, [query, products]);

  const totals = cartTotals(cart.map((l) => ({ unitGross: l.product.priceGross, quantity: l.quantity, ivaRate: l.product.ivaRate })), isAdmin ? num(discount) : 0);
  const payments = pay.map((p) => ({ method: p.method, amount: p.amount === "" && pay.length === 1 && p.method !== "efectivo" ? totals.total : num(p.amount) }));
  const result = settle(totals.total, payments);

  useEffect(() => { searchRef.current?.focus(); }, []);
  // Al terminar la venta: imprime el recibo (abre el cajón si el controlador lo tiene activado) y deja la caja lista.
  useEffect(() => {
    if (state.saleId && state.saleId !== lastPrinted.current) {
      lastPrinted.current = state.saleId;
      setCart([]); setPaying(false); setPay([{ key: 1, method: "efectivo", amount: "" }]); setDiscount(""); setCustomer("");
      if (autoPrint) setTimeout(() => document.getElementById("print-last-sale")?.click(), 150);
    }
  }, [state.saleId, autoPrint]);

  function add(p: PosProduct, qty?: number) {
    setCart((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      const step = qty ?? (p.byWeight ? 100 : 1);
      if (i >= 0) return c.map((l, n) => (n === i ? { ...l, quantity: l.quantity + step } : l));
      return [...c, { product: p, quantity: step }];
    });
    setQuery("");
    searchRef.current?.focus();
  }
  function onEnter() {
    const q = query.trim().toLowerCase();
    const exact = products.find((p) => p.sku.toLowerCase() === q); // lector de código de barras
    const pick = exact ?? matches[0];
    if (pick) add(pick);
  }
  const setQty = (id: number, q: number) => setCart((c) => (q <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, quantity: q } : l))));
  const payload = JSON.stringify({
    lines: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    discount: isAdmin ? num(discount) : 0, customer: customer.trim() || null,
    payments: payments.map((p) => ({ method: p.method, amount: p.amount })),
  });
  const ticket: TicketData | undefined = state.receipt;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <section className="space-y-3">
        <div className="card space-y-3">
          <input
            ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter(); } }}
            placeholder="Buscar producto o escanear código…" className="input text-lg" autoComplete="off" aria-label="Buscar producto"
          />
          {matches.length > 0 && (
            <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => add(p)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]">
                    <span className="min-w-0"><span className="block truncate font-medium">{p.name}</span><span className="block truncate text-xs text-muted">{p.category ?? ""}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">{fmtCOP(p.priceGross)}{p.byWeight ? "/g" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card">
          <p className="label">Los más vendidos</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {quick.map((id) => byId.get(id)).filter((p): p is PosProduct => !!p).map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} className="rounded-xl border border-[var(--border)] p-2 text-left transition-colors hover:border-brand-500 hover:bg-[var(--surface-2)]">
                <span className="line-clamp-2 block text-sm font-medium leading-tight">{p.name}</span>
                <span className="mt-1 block text-sm font-semibold tabular-nums text-brand-700 dark:text-brand-500">{fmtCOP(p.priceGross)}{p.byWeight ? "/g" : ""}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Venta actual</h2>{cart.length > 0 && <button type="button" onClick={() => { setCart([]); setPaying(false); }} className="text-sm text-muted underline">Vaciar</button>}</div>
          {cart.length === 0 && <p className="py-6 text-center text-sm text-muted">Busca o toca un producto para empezar.</p>}
          <ul className="divide-y divide-[var(--border)]">
            {cart.map((l) => (
              <li key={l.product.id} className="space-y-1 py-2">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-medium leading-tight">{l.product.name}</p>
                  <p className="shrink-0 font-semibold tabular-nums">{fmtCOP(lineGross({ unitGross: l.product.priceGross, quantity: l.quantity, ivaRate: l.product.ivaRate }))}</p>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <button type="button" onClick={() => setQty(l.product.id, l.quantity - (l.product.byWeight ? 50 : 1))} className="btn-secondary px-3 py-1" aria-label="Menos">−</button>
                  <input value={l.quantity} onChange={(e) => setQty(l.product.id, Number(e.target.value.replace(",", ".")) || 0)} inputMode="decimal" className="input w-20 py-1 text-center" aria-label="Cantidad" />
                  <button type="button" onClick={() => setQty(l.product.id, l.quantity + (l.product.byWeight ? 50 : 1))} className="btn-secondary px-3 py-1" aria-label="Más">+</button>
                  <span className="text-muted">{l.product.byWeight ? "g" : "und"} × {fmtCOP(l.product.priceGross)}</span>
                  <button type="button" onClick={() => setQty(l.product.id, 0)} className="ml-auto text-muted underline">Quitar</button>
                </div>
              </li>
            ))}
          </ul>
          {cart.length > 0 && (
            <>
              {isAdmin && (
                <label className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted">Descuento (solo administradores)</span>
                  <input value={discount} onChange={(e) => setDiscount(e.target.value)} inputMode="numeric" placeholder="0" className="input w-28 py-1 text-right" />
                </label>
              )}
              <div className="flex items-end justify-between border-t border-[var(--border)] pt-3">
                <span className="text-muted">Total</span>
                <span className="text-4xl font-bold tracking-tight tabular-nums">{fmtCOP(totals.total)}</span>
              </div>
              {!paying && <button type="button" onClick={() => setPaying(true)} className="btn-primary w-full py-3 text-lg">Cobrar</button>}
            </>
          )}
        </div>

        {paying && cart.length > 0 && (
          <form action={action} className="card space-y-3">
            <input type="hidden" name="payload" value={payload} />
            <h2 className="font-semibold">Cobro</h2>
            {pay.map((row, i) => (
              <div key={row.key} className="space-y-2 rounded-xl border border-[var(--border)] p-2">
                <div className="flex flex-wrap gap-1.5">
                  {METHOD_ORDER.map((m) => (
                    <button key={m} type="button" onClick={() => setPay((r) => r.map((x) => (x.key === row.key ? { ...x, method: m } : x)))} className={row.method === m ? "btn-primary px-3 py-1.5 text-sm" : "btn-secondary px-3 py-1.5 text-sm"}>{POS_METHODS[m]}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    value={row.amount} onChange={(e) => setPay((r) => r.map((x) => (x.key === row.key ? { ...x, amount: e.target.value } : x)))}
                    inputMode="numeric" className="input" aria-label="Valor"
                    placeholder={row.method === "efectivo" ? "¿Con cuánto paga?" : pay.length === 1 ? String(totals.total) : "Valor"}
                  />
                  {pay.length > 1 && <button type="button" onClick={() => setPay((r) => r.filter((x) => x.key !== row.key))} className="btn-secondary" aria-label="Quitar pago">✕</button>}
                </div>
                {row.method === "efectivo" && i === 0 && pay.length === 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {quickCash(totals.total).map((v) => (
                      <button key={v} type="button" onClick={() => setPay((r) => r.map((x) => (x.key === row.key ? { ...x, amount: String(v) } : x)))} className="btn-secondary px-3 py-1 text-sm">{v === totals.total ? "Exacto" : fmtCOP(v)}</button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setPay((r) => [...r, { key: ++keySeq.current + 1, method: "nequi", amount: "" }])} className="text-sm underline">+ Pago mixto (otro medio)</button>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Cliente (opcional)" className="input" />
            {result.ok && result.change > 0 && (
              <p className="rounded-xl px-3 py-2 text-center text-2xl font-bold" style={{ background: "var(--good-bg)", color: "var(--good)" }}>Cambio: {fmtCOP(result.change)}</p>
            )}
            {!result.ok && payments.some((p) => p.amount > 0) && <p className="text-sm" style={{ color: "var(--warn)" }}>{result.error}</p>}
            {state.error && <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>{state.error}</p>}
            <button className="btn-primary w-full py-3 text-lg" disabled={pending || !result.ok}>{pending ? "Registrando…" : "Confirmar venta e imprimir"}</button>
          </form>
        )}

        {ticket && state.saleId && !paying && cart.length === 0 && (
          <div className="card space-y-2">
            <p className="rounded-lg px-3 py-2 text-sm font-medium" style={{ background: "var(--good-bg)", color: "var(--good)" }}>
              Venta V-{state.saleId} registrada{state.change ? ` · devuelve ${fmtCOP(state.change)}` : ""}.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <PrintTicket id="print-last-sale" data={ticket} label="Reimprimir recibo" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} /> Imprimir al cobrar</label>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
