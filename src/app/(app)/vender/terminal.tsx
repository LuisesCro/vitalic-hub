"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { ProductPouch } from "@/components/product-pouch";
import { PrintTicket, type TicketData } from "@/components/ticket";
import { quoteFromTiers, type PublicQuoteItem } from "@/lib/bulk";
import { fmtCOP } from "@/lib/format";
import { POS_METHODS, cartTotals, lineGross, quickCash, settle, type PosMethod } from "@/lib/pos";
import type { Settings } from "@/lib/settings-defaults";
import { createSale, type SaleState } from "./actions";
import type { PosProduct } from "./data";

type CartLine = { product: PosProduct; quantity: number };
type PayRow = { key: number; method: PosMethod; amount: string };
type BulkLine = { key: number; item: PublicQuoteItem; kg: number; total: number };
type Held = { at: number; cart: { id: number; q: number }[]; bulk: { familyId: number; kg: number; total: number }[]; customer: string };
const HOLD_KEY = "vitalic-espera";
const KG_BUTTONS = [0.5, 1, 2, 3, 5, 10, 25];
/** Cuántas bolsas hay: rojo si no hay, ámbar si quedan pocas. Sin conteo no se muestra nada. */
function StockChip({ stock }: { stock: number | null }) {
  if (stock === null) return null;
  const out = stock <= 0;
  const low = !out && stock <= 3;
  return (
    <span
      className="inline-block rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-none"
      style={{ background: out ? "var(--bad-bg)" : low ? "var(--warn-bg, #fdf1d6)" : "var(--surface-2)", color: out ? "var(--bad)" : low ? "var(--warn)" : "inherit" }}
    >
      {out ? "Sin stock" : `Stock ${stock.toLocaleString("es-CO", { maximumFractionDigits: 1 })}`}
    </span>
  );
}
const kgText = (kg: number) => `${kg.toLocaleString("es-CO", { maximumFractionDigits: 3 })} kg`;

const strip = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const num = (v: string) => Number(v.replace(/\./g, "").replace(",", ".")) || 0;
const METHOD_ORDER: PosMethod[] = ["efectivo", "tarjeta", "nequi", "daviplata", "breb", "transferencia"];

export function PosTerminal({ products, quick, isAdmin, bulkItems, settings }: { products: PosProduct[]; quick: number[]; isAdmin: boolean; bulkItems: PublicQuoteItem[]; settings: Settings }) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [bulkCart, setBulkCart] = useState<BulkLine[]>([]);
  const [draft, setDraft] = useState<{ item: PublicQuoteItem; kg: string; price: string } | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [held, setHeld] = useState<Held[]>([]);
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState(false);
  const [pay, setPay] = useState<PayRow[]>([{ key: 1, method: "efectivo", amount: "" }]);
  const [discount, setDiscountText] = useState("");
  // Si se toca un botón de %, el descuento sigue a la venta (se recalcula al cambiar el carrito); si se escribe un valor, queda fijo.
  const [discountPct, setDiscountPct] = useState<number | null>(null);
  const setDiscount = (v: string) => { setDiscountText(v); setDiscountPct(null); };
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

  const bulkMatches = useMemo(() => {
    const q = strip(query.trim());
    if (!q) return [];
    return bulkItems.filter((b) => q.split(/\s+/).every((w) => strip(b.name).includes(w))).slice(0, 6);
  }, [query, bulkItems]);
  const productGross = cart.reduce((t, l) => t + lineGross({ unitGross: l.product.priceGross, quantity: l.quantity, ivaRate: l.product.ivaRate }), 0);
  const discountValue = discountPct !== null ? Math.round(productGross * discountPct) : num(discount);
  const maxDiscount = isAdmin ? Infinity : Math.floor(productGross * settings.descuentoMaxCajera);
  const totals = cartTotals(
    [...cart.map((l) => ({ unitGross: l.product.priceGross, quantity: l.quantity, ivaRate: l.product.ivaRate })), ...bulkCart.map((b) => ({ unitGross: b.total, quantity: 1, ivaRate: b.item.ivaRate }))],
    Math.min(discountValue, maxDiscount),
  );
  const empty = cart.length === 0 && bulkCart.length === 0;
  const payments = pay.map((p) => ({ method: p.method, amount: p.amount === "" && pay.length === 1 && p.method !== "efectivo" ? totals.total : num(p.amount) }));
  const result = settle(totals.total, payments);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    try { setHeld(JSON.parse(localStorage.getItem(HOLD_KEY) ?? "[]")); } catch { /* sin almacenamiento */ }
  }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "F2") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "F4") { e.preventDefault(); setPaying(true); }
      else if (e.key === "Escape") { setQuery(""); setDraft(null); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Al terminar la venta: imprime el recibo (abre el cajón si el controlador lo tiene activado) y deja la caja lista.
  useEffect(() => {
    if (state.saleId && state.saleId !== lastPrinted.current) {
      lastPrinted.current = state.saleId;
      setCart([]); setBulkCart([]); setDraft(null); setPaying(false); setPay([{ key: 1, method: "efectivo", amount: "" }]); setDiscount(""); setCustomer("");
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
  function saveHeld(list: Held[]) {
    setHeld(list);
    try { localStorage.setItem(HOLD_KEY, JSON.stringify(list)); } catch { /* sin almacenamiento */ }
  }
  function putOnHold() {
    if (empty) return;
    saveHeld([...held, { at: Date.now(), cart: cart.map((l) => ({ id: l.product.id, q: l.quantity })), bulk: bulkCart.map((b) => ({ familyId: b.item.familyId, kg: b.kg, total: b.total })), customer }]);
    setCart([]); setBulkCart([]); setPaying(false); setDiscount(""); setCustomer("");
    searchRef.current?.focus();
  }
  function resume(h: Held) {
    if (!empty) putOnHold();
    setCart(h.cart.flatMap((l) => { const p = byId.get(l.id); return p ? [{ product: p, quantity: l.q }] : []; }));
    setBulkCart(h.bulk.flatMap((b) => { const item = bulkItems.find((i) => i.familyId === b.familyId); return item ? [{ key: ++keySeq.current, item, kg: b.kg, total: b.total }] : []; }));
    setCustomer(h.customer);
    setHeld((cur) => { const next = cur.filter((x) => x.at !== h.at); try { localStorage.setItem(HOLD_KEY, JSON.stringify(next)); } catch { /* sin almacenamiento */ } return next; });
  }
  function openDraft(item: PublicQuoteItem, kg = 25) {
    const quote = quoteFromTiers(item, kg, settings);
    setDraft({ item, kg: String(kg), price: String(quote.total) });
    setQuery(""); setBulkOpen(false);
  }
  function addDraft() {
    if (!draft) return;
    const kg = num(draft.kg);
    const total = Math.round(num(draft.price));
    if (!(kg > 0) || !(total > 0)) return;
    setBulkCart((c) => [...c, { key: ++keySeq.current, item: draft.item, kg, total }]);
    setDraft(null);
    searchRef.current?.focus();
  }
  const setQty = (id: number, q: number) => setCart((c) => (q <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, quantity: q } : l))));
  const payload = JSON.stringify({
    lines: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
    bulkLines: bulkCart.map((b) => ({ familyId: b.item.familyId, kg: b.kg, total: b.total })),
    discount: Math.min(discountValue, maxDiscount), customer: customer.trim() || null,
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
          {bulkMatches.length > 0 && (
            <ul className="divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
              {bulkMatches.map((b) => (
                <li key={b.familyId}>
                  <button type="button" onClick={() => openDraft(b)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]">
                    <span className="min-w-0"><span className="block truncate font-medium">{b.name} · por kilo / bulto</span><span className="block truncate text-xs text-muted">Granel: elige 1, 5, 25 kg…</span></span>
                    <span className="shrink-0 rounded-lg px-2 py-0.5 text-xs font-semibold" style={{ background: "var(--surface-2)" }}>GRANEL</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {matches.length > 0 && (
            <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto rounded-xl border border-[var(--border)]">
              {matches.map((p) => (
                <li key={p.id}>
                  <button type="button" onClick={() => add(p)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-[var(--surface-2)]">
                    <ProductPouch name={p.name} size={44} />
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.name}</span><span className="mt-0.5 flex items-center gap-2 text-xs text-muted"><span className="truncate">{p.category ?? ""}</span><StockChip stock={p.stock} /></span></span>
                    <span className="shrink-0 font-semibold tabular-nums">{fmtCOP(p.priceGross)}{p.byWeight ? "/g" : ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="label !mb-0">Granel y bultos (por kilo)</p>
            <button type="button" onClick={() => setBulkOpen((o) => !o)} className="btn-secondary px-3 py-1.5 text-sm">{bulkOpen ? "Cerrar" : "Vender a granel / bulto 25 kg"}</button>
          </div>
          {bulkOpen && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {bulkItems.map((b) => (
                <button key={b.familyId} type="button" onClick={() => openDraft(b)} className="rounded-xl border border-[var(--border)] p-2 text-left hover:border-brand-500 hover:bg-[var(--surface-2)]">
                  <span className="line-clamp-2 block text-sm font-medium leading-tight">{b.name}</span>
                  <span className="mt-1 block text-xs text-muted">{b.stockKg !== null ? `${Math.floor(b.stockKg)} kg disponibles` : ""}</span>
                </button>
              ))}
            </div>
          )}
          {draft && <DraftPanel draft={draft} setDraft={setDraft} settings={settings} isAdmin={isAdmin} onAdd={addDraft} />}
        </div>
        <div className="card">
          <p className="label">Los más vendidos</p>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 2xl:grid-cols-3">
            {quick.map((id) => byId.get(id)).filter((p): p is PosProduct => !!p).map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-1.5 text-left transition-colors hover:border-brand-500 hover:bg-[var(--surface-2)]">
                <span className="flex shrink-0 items-center justify-center rounded-lg bg-brand-50 p-1 dark:bg-[var(--surface-2)]"><ProductPouch name={p.name} size={52} /></span>
                <span className="min-w-0">
                  <span className="line-clamp-2 block text-sm font-medium leading-tight">{p.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold tabular-nums text-brand-700 dark:text-brand-500">{fmtCOP(p.priceGross)}{p.byWeight ? "/g" : ""}<StockChip stock={p.stock} /></span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3 lg:sticky lg:top-4 lg:self-start">
        <div className="card space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Venta actual</h2><div className="flex items-center gap-3 text-sm">
            {!empty && <button type="button" onClick={putOnHold} className="underline">Poner en espera</button>}
            {!empty && <button type="button" onClick={() => { setCart([]); setBulkCart([]); setPaying(false); }} className="text-muted underline">Vaciar</button>}
          </div></div>
          {held.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {held.map((h, i) => (
                <button key={h.at} type="button" onClick={() => resume(h)} className="btn-secondary px-3 py-1 text-sm">
                  Espera {i + 1}{h.customer ? ` · ${h.customer}` : ""} ({h.cart.length + h.bulk.length})
                </button>
              ))}
            </div>
          )}
          {empty && <p className="py-6 text-center text-sm text-muted">Busca o toca un producto para empezar. <span className="block text-xs">F2 buscar · F4 cobrar · Esc limpiar</span></p>}
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
                  {l.product.stock !== null && l.quantity > l.product.stock && <span className="text-xs" style={{ color: "var(--warn)" }}>Solo hay {Math.max(0, Math.floor(l.product.stock))}</span>}
                  <button type="button" onClick={() => setQty(l.product.id, 0)} className="ml-auto text-muted underline">Quitar</button>
                </div>
              </li>
            ))}
            {bulkCart.map((b) => (
              <li key={`b${b.key}`} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{b.item.name} <span className="rounded px-1.5 py-0.5 text-xs" style={{ background: "var(--surface-2)" }}>granel</span></p>
                  <p className="text-xs text-muted">{kgText(b.kg)} × {fmtCOP(Math.round(b.total / b.kg))}/kg</p>
                </div>
                <div className="text-right"><p className="font-semibold tabular-nums">{fmtCOP(b.total)}</p><button type="button" onClick={() => setBulkCart((c) => c.filter((x) => x.key !== b.key))} className="text-sm text-muted underline">Quitar</button></div>
              </li>
            ))}
          </ul>
          {!empty && (
            <>
              {productGross > 0 && maxDiscount > 0 && (
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted">Descuento{isAdmin ? "" : ` (máx. ${Math.round(settings.descuentoMaxCajera * 100)} %)`}</span>
                    <input value={discountPct !== null ? String(discountValue) : discount} onChange={(e) => setDiscount(e.target.value)} inputMode="numeric" placeholder="0" className="input w-28 py-1 text-right" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[0.05, 0.1].filter((pct) => isAdmin || pct <= settings.descuentoMaxCajera).map((pct) => (
                      <button key={pct} type="button" onClick={() => setDiscountPct(pct)} className={`${discountPct === pct ? "btn-primary" : "btn-secondary"} px-2.5 py-1 text-xs`}>{pct * 100} %</button>
                    ))}
                    {discountValue > 0 && <button type="button" onClick={() => setDiscount("")} className="px-2 py-1 text-xs text-muted underline">Quitar</button>}
                  </div>
                  {discountValue > maxDiscount && <p className="text-xs" style={{ color: "var(--warn)" }}>Se aplicará el máximo permitido: {fmtCOP(maxDiscount)}.</p>}
                </div>
              )}
              <div className="flex items-end justify-between border-t border-[var(--border)] pt-3">
                <span className="text-muted">Total</span>
                <span className="text-4xl font-bold tracking-tight tabular-nums">{fmtCOP(totals.total)}</span>
              </div>
              {!paying && <button type="button" onClick={() => setPaying(true)} className="btn-primary w-full py-3 text-lg">Cobrar</button>}
            </>
          )}
        </div>

        {paying && !empty && (
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

        {ticket && state.saleId && !paying && empty && (
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

function DraftPanel({ draft, setDraft, settings, isAdmin, onAdd }: {
  draft: { item: PublicQuoteItem; kg: string; price: string };
  setDraft: (d: { item: PublicQuoteItem; kg: string; price: string } | null) => void;
  settings: Settings; isAdmin: boolean; onAdd: () => void;
}) {
  const kg = num(draft.kg);
  const quote = kg > 0 ? quoteFromTiers(draft.item, kg, settings) : null;
  const price = Math.round(num(draft.price));
  const belowFloor = !!quote && price < quote.floorTotal;
  const blocked = belowFloor && !isAdmin;
  const stock = draft.item.stockKg;
  const set = (nextKg: number) => {
    const q = quoteFromTiers(draft.item, nextKg, settings);
    setDraft({ ...draft, kg: String(nextKg), price: String(q.total) });
  };
  return (
    <div className="space-y-3 rounded-xl border border-brand-500 p-3">
      <div className="flex items-center justify-between"><p className="font-semibold">{draft.item.name} · granel</p><button type="button" onClick={() => setDraft(null)} className="text-sm text-muted underline">Cancelar</button></div>
      <div className="flex flex-wrap gap-1.5">
        {KG_BUTTONS.map((k) => (
          <button key={k} type="button" onClick={() => set(k)} className={kg === k ? "btn-primary px-3 py-1.5 text-sm" : "btn-secondary px-3 py-1.5 text-sm"}>{k === 25 ? "Bulto 25 kg" : kgText(k)}</button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm"><span className="label">Kilos</span><input value={draft.kg} onChange={(e) => { const v = num(e.target.value); setDraft({ ...draft, kg: e.target.value, price: v > 0 ? String(quoteFromTiers(draft.item, v, settings).total) : draft.price }); }} inputMode="decimal" className="input" /></label>
        <label className="text-sm"><span className="label">Precio total (con IVA)</span><input value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} inputMode="numeric" className="input font-semibold" /></label>
      </div>
      {quote && (
        <div className="space-y-0.5 text-sm">
          <p className="text-muted">{quote.tierLabel} · {fmtCOP(Math.round(price / kg))}/kg</p>
          {quote.retailTotal && quote.savings !== null && quote.savings > 0 && <p className="text-muted">En bolsas pagaría {fmtCOP(quote.retailTotal)} · ahorra {Math.round(quote.savings * 100)} %</p>}
          {stock !== null && kg > stock && <p style={{ color: "var(--warn)" }}>Ojo: según el inventario solo hay {Math.floor(stock)} kg.</p>}
          {belowFloor && <p style={{ color: "var(--bad)" }}>{isAdmin ? "Por debajo del precio mínimo" : `El mínimo es ${fmtCOP(quote.floorTotal)}; pide autorización a Luis o Paula.`}</p>}
        </div>
      )}
      <button type="button" onClick={onAdd} disabled={!quote || !(price > 0) || blocked} className="btn-primary w-full py-2.5">Agregar a la venta · {fmtCOP(price)}</button>
    </div>
  );
}
