import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { quoteItems, quotes, suppliers } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { fmtCOP, todayISO } from "@/lib/format";
import { pickSupplier } from "@/lib/auto-order";
import { syncAutoOrder } from "@/lib/auto-order-sync";
import { requireAdmin } from "@/lib/session";
import { lastKgPrices, shortSupplierName } from "@/lib/supplier-prices";
import { moveQuoteItem, removeQuoteItem } from "../proveedores/actions";
import { generateQuote } from "./actions";
import { ReferenceForm } from "./reference-form";

export const metadata = { title: "Cotizaciones · Vitalic Hub" };

const day = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const key = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

type Line = {
  id: number; name: string; qtyKg: number; auto: boolean; price: number; date: string | null;
  /** Texto corto de por qué este proveedor (o qué hay más barato). */
  note: string | null; warn: boolean;
};

export default async function CotizacionesPage() {
  await requireAdmin();
  // El pedido se arma solo con lo que se está acabando cada vez que se abre esta pantalla.
  const { noSupplier } = await syncAutoOrder();
  const pending = await db
    .select({ item: quoteItems, supplier: suppliers.name })
    .from(quoteItems).innerJoin(suppliers, eq(suppliers.id, quoteItems.supplierId))
    .where(and(eq(quoteItems.status, "borrador"), isNull(quoteItems.quoteId)))
    .orderBy(suppliers.name, quoteItems.name);
  const history = await lastKgPrices([...new Set(pending.map((p) => p.item.rawMaterialId).filter((x): x is number => x !== null))]);
  const today = todayISO();
  const bySupplier = new Map<number, { name: string; items: Line[]; total: number; saving: number }>();
  for (const p of pending) {
    const it = p.item;
    const prices = it.rawMaterialId ? history.get(it.rawMaterialId) ?? [] : [];
    const own = prices.find((x) => x.supplierId === it.supplierId);
    const pick = pickSupplier(prices, today);
    let note: string | null = null;
    let warn = false;
    let saving = 0;
    if (pick && pick.best.supplierId !== it.supplierId) {
      note = `Más barato en ${shortSupplierName(pick.best.supplier)}: ${fmtCOP(pick.best.pricePerKg)}/kg`;
      warn = true;
    } else if (pick) {
      if (pick.stale) { note = `Precio de ${pick.best.date ?? "fecha desconocida"}: confírmalo`; warn = true; }
      else if (pick.savingPerKg > 0 && pick.last) { note = `Ahorras ${fmtCOP(pick.savingPerKg)}/kg frente a ${shortSupplierName(pick.last.supplier)}`; saving = pick.savingPerKg * it.qtyKg; }
      else if (pick.runnerUp) note = `Mejor precio · sigue ${shortSupplierName(pick.runnerUp.supplier)} a ${fmtCOP(pick.runnerUp.pricePerKg)}/kg`;
      else note = "Único proveedor con precio";
    } else if (it.rawMaterialId) { note = "Sin precio registrado"; warn = true; }
    const e = bySupplier.get(it.supplierId) ?? { name: p.supplier, items: [], total: 0, saving: 0 };
    e.items.push({ id: it.id, name: it.name, qtyKg: it.qtyKg, auto: it.createdBy === null, price: own?.pricePerKg ?? 0, date: own?.date ?? null, note, warn });
    e.total += (own?.pricePerKg ?? 0) * it.qtyKg;
    e.saving += saving;
    bySupplier.set(it.supplierId, e);
  }
  const grand = [...bySupplier.values()].reduce((t, g) => t + g.total, 0);
  const grandSaving = [...bySupplier.values()].reduce((t, g) => t + g.saving, 0);

  const supplierList = await db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(suppliers.name);
  const list = await db
    .select({
      q: quotes, supplier: suppliers.name,
      lines: sql<number>`(select count(*) from quote_items i where i.quote_id = ${quotes.id})`.mapWith(Number),
      total: sql<number>`(select coalesce(sum(i.qty_kg * i.price), 0) from quote_items i where i.quote_id = ${quotes.id})`.mapWith(Number),
    })
    .from(quotes).innerJoin(suppliers, eq(suppliers.id, quotes.supplierId))
    .orderBy(desc(quotes.createdAt)).limit(200);
  const days = new Map<string, typeof list>();
  for (const r of list) days.set(key(r.q.createdAt), [...(days.get(key(r.q.createdAt)) ?? []), r]);

  return (
    <div className="space-y-5">
      <PageHeader title="Cotizaciones" subtitle="Solicitudes de cotización a proveedores, por fecha.">
        <Link href="/por-pedir" className="btn-secondary">Ir a «Por pedir»</Link>
      </PageHeader>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Pedido sugerido por proveedor</h2>
          {grand > 0 && <span className="text-sm text-muted">Estimado {fmtCOP(grand)} sin IVA{grandSaving > 0 ? ` · ahorras ~${fmtCOP(grandSaving)} eligiendo el más barato` : ""}</span>}
        </div>
        <p className="text-sm text-muted">El HUB arma esta lista solo con lo que se está agotando y lo que la cajera marcó urgente, y pone cada producto con el proveedor del <strong>menor precio por kilo</strong> (compras y cotizaciones de los últimos 6 meses). Puedes cambiar los kilos o el proveedor de cada producto con <strong>Guardar cambios</strong>; lo que edites queda como lo dejaste y el HUB ya no lo cambia.</p>
        {bySupplier.size === 0 ? (
          <p className="text-sm text-muted">Nada por pedir ahora mismo. Cuando algo se empiece a acabar aparecerá aquí con su proveedor; también puedes agregarlo a mano desde <Link href="/por-pedir" className="underline">Lo que se acaba</Link>.</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {[...bySupplier.entries()].map(([id, g]) => (
              <div key={id} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium leading-tight">{g.name}</h3>
                    <p className="text-xs text-muted">{g.items.length} {g.items.length === 1 ? "producto" : "productos"}{g.total > 0 ? ` · ~${fmtCOP(g.total)} sin IVA` : ""}</p>
                  </div>
                  <form action={generateQuote}><input type="hidden" name="supplierId" value={id} /><button className="btn-primary text-sm">Generar solicitud</button></form>
                </div>
                <ul className="divide-y divide-[var(--border)] text-sm">
                  {g.items.map((it) => (
                    <li key={it.id} className="space-y-1 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span className="min-w-0 font-medium">
                          {it.name}
                          {it.auto && <span className="ml-1 rounded-full px-1.5 py-0.5 align-middle text-[10px] font-semibold" style={{ background: "var(--surface-2)" }} title="Lo agregó el HUB porque se está acabando">AUTO</span>}
                        </span>
                        <span className="text-xs">{it.qtyKg.toLocaleString("es-CO")} kg{it.price > 0 ? ` × ${fmtCOP(it.price)}/kg = ${fmtCOP(it.price * it.qtyKg)}` : ""}</span>
                      </div>
                      {it.note && <p className="text-xs" style={{ color: it.warn ? "var(--warn)" : "var(--good)" }}>{it.note}</p>}
                      <div className="flex flex-wrap items-center gap-1">
                        <form action={moveQuoteItem} className="flex flex-wrap items-center gap-1">
                          <input type="hidden" name="id" value={it.id} />
                          <label className="flex items-center gap-1 text-xs">
                            <input name="qtyKg" inputMode="decimal" defaultValue={String(it.qtyKg).replace(".", ",")} className="input !py-1 w-16 text-xs" aria-label="Kilos a pedir" />
                            kg
                          </label>
                          <select name="supplierId" defaultValue={id} className="input !py-1 max-w-[11rem] text-xs" aria-label="Proveedor">
                            {supplierList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                          <button className="btn-secondary !px-2 !py-1 text-xs">Guardar cambios</button>
                        </form>
                        <form action={removeQuoteItem}><input type="hidden" name="id" value={it.id} /><button className="btn-secondary !px-2 !py-1 text-xs" title={it.auto ? "No vuelve a aparecer en 14 días" : undefined}>Quitar</button></form>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {noSupplier.length > 0 && (
          <div className="rounded-xl border-2 p-3 text-sm" style={{ borderColor: "var(--warn)" }}>
            <p className="font-medium">Se acaban pero no tienen ningún precio de proveedor ({noSupplier.length})</p>
            <p className="text-xs text-muted">Agrégalos a mano desde <Link href="/por-pedir" className="underline">Lo que se acaba</Link>, o sube abajo una factura o cotización de quien los vende para que el HUB los ubique solo.</p>
            <p className="mt-1">{noSupplier.map((n) => n.name).join(" · ")}</p>
          </div>
        )}
      </section>

      {list.length === 0 ? (
        <p className="text-sm text-muted">Todavía no has generado cotizaciones.</p>
      ) : (
        [...days.entries()].map(([k, rows]) => (
          <section key={k} className="card">
            <h2 className="mb-2 font-semibold first-letter:uppercase">{day(rows[0].q.createdAt)}</h2>
            <ul className="divide-y divide-[var(--border)]">
              {rows.map(({ q, supplier, lines, total }) => (
                <li key={q.id}>
                  <Link href={`/cotizaciones/${q.id}`} className="flex flex-wrap items-center justify-between gap-2 py-2 hover:bg-[var(--surface-2)]">
                    <span className="min-w-0">
                      <span className="block font-medium">COT-{q.id} · {supplier}</span>
                      <span className="text-xs text-muted">{lines} {lines === 1 ? "producto" : "productos"}{total > 0 ? ` · estimado ${fmtCOP(total)} sin IVA` : ""}</span>
                    </span>
                    <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: q.status === "enviada" ? "var(--good-bg)" : "var(--surface-2)" }}>{q.status === "enviada" ? "Enviada" : "Borrador"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      <details className="card">
        <summary className="cursor-pointer font-semibold">Precios de referencia: subir una cotización o factura anterior</summary>
        <div className="space-y-2 pt-3">
          <p className="text-sm text-muted">El HUB lee el documento y guarda los precios por kilo de ese proveedor con la fecha del documento. Las cotizaciones nuevas los usan como precio estimado hasta que haya una compra más reciente.</p>
          <ReferenceForm suppliers={supplierList} />
        </div>
      </details>
    </div>
  );
}
