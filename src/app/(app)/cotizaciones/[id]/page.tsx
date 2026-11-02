import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { quoteItems, quotes, rawMaterials, suppliers } from "@/db/schema";
import { BrandLogo } from "@/components/icons";
import { BUSINESS } from "@/lib/business";
import { fmtCOP } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { lastKgPrices, shortSupplierName } from "@/lib/supplier-prices";
import { addQuoteLine, deleteQuote, fillQuotePrices, linkQuoteLine, removeQuoteLine, saveQuoteLine, saveQuoteNote, setQuoteQty, setQuoteStatus } from "../actions";
import { kindPlural, packRecommendation } from "@/lib/pack";
import { PrintQuote } from "./print-button";

export const metadata = { title: "Cotización · Vitalic Hub" };

const long = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "long", year: "numeric" });

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const [q] = await db.select().from(quotes).where(eq(quotes.id, id));
  if (!q) notFound();
  const [supplier] = await db.select().from(suppliers).where(eq(suppliers.id, q.supplierId));
  const lines = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, id)).orderBy(asc(quoteItems.name));
  const materials = await db.select({ id: rawMaterials.id, name: rawMaterials.name }).from(rawMaterials).where(eq(rawMaterials.active, true)).orderBy(rawMaterials.name);
  const history = await lastKgPrices(lines.map((l) => l.rawMaterialId).filter((x): x is number => x !== null));
  const base = (l: { qtyKg: number; price: number }) => l.qtyKg * l.price;
  const vat = (l: { qtyKg: number; price: number; ivaRate: number }) => base(l) * l.ivaRate;
  const showIva = lines.some((l) => l.ivaRate > 0 && l.price > 0);
  const subtotal = lines.reduce((t, l) => t + base(l), 0);
  const iva = lines.reduce((t, l) => t + vat(l), 0);
  const total = subtotal + iva;
  const number = `COT-${q.id}`;
  const ownOf = (l: { rawMaterialId: number | null }) => (l.rawMaterialId ? (history.get(l.rawMaterialId) ?? []).find((p) => p.supplierId === q.supplierId) : undefined);
  /** Texto de cantidad para el documento: "2 cajas · 20 kg" si son cajas o bultos completos. */
  const qtyText = (l: { rawMaterialId: number | null; qtyKg: number }) => {
    if (!l.qtyKg) return "";
    const o = ownOf(l);
    if (o && o.packKg && o.kind !== "kilo") {
      const n = l.qtyKg / o.packKg;
      if (Math.abs(n - Math.round(n)) < 0.01 && Math.round(n) >= 1) return `${Math.round(n)} ${Math.round(n) === 1 ? o.kind : kindPlural(o.kind)} · ${l.qtyKg.toLocaleString("es-CO")} kg`;
    }
    return `${l.qtyKg.toLocaleString("es-CO")} kg`;
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/cotizaciones" className="btn-secondary">← Cotizaciones</Link>
        <div className="flex flex-wrap gap-2">
          <PrintQuote />
          <form action={fillQuotePrices}><input type="hidden" name="quoteId" value={q.id} /><button className="btn-secondary" title="Pone el último precio de este proveedor en los renglones que no tienen">Completar precios</button></form>
          <form action={setQuoteStatus}>
            <input type="hidden" name="id" value={q.id} />
            <input type="hidden" name="status" value={q.status === "enviada" ? "borrador" : "enviada"} />
            <button className="btn-secondary">{q.status === "enviada" ? "Volver a borrador" : "Marcar como enviada"}</button>
          </form>
          <form action={deleteQuote}><input type="hidden" name="id" value={q.id} /><button className="btn-secondary text-red-600">Eliminar</button></form>
        </div>
      </div>

      {/* Documento: lo que se imprime o se guarda en PDF */}
      <article className="rounded-xl bg-white p-5 text-black shadow-sm print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 pb-3" style={{ borderColor: "#2ba1b8" }}>
          <div>
            <BrandLogo className="h-9 w-auto" />
            <p className="mt-1 text-xs">NIT {BUSINESS.nit} · {BUSINESS.address}, {BUSINESS.city}</p>
            <p className="text-xs">{BUSINESS.phone} · {BUSINESS.email}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold" style={{ color: "#186878" }}>SOLICITUD DE COTIZACIÓN</p>
            <p className="text-sm font-semibold">{number}</p>
            <p className="text-xs">{long(q.createdAt)}</p>
          </div>
        </header>
        <div className="py-3 text-sm">
          <p><span className="text-gray-500">Proveedor:</span> <strong>{supplier?.name}</strong>{supplier?.nit ? ` · NIT ${supplier.nit}` : ""}</p>
          {q.note && <p className="mt-1 whitespace-pre-line">{q.note}</p>}
        </div>

        {/* Impresión */}
        <table className="hidden w-full text-sm print:table">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1">#</th><th>Producto</th><th className="text-right">Cantidad</th><th className="text-right">Precio por kg</th>
              {showIva && <th className="text-right">IVA</th>}<th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="border-b border-black/20">
                <td className="py-1">{i + 1}</td><td>{l.name}{(() => { const o = ownOf(l); return o && o.packKg && o.kind !== "kilo" ? <span className="text-xs text-gray-500"> ({o.kind} de {o.packKg.toLocaleString("es-CO")} kg)</span> : null; })()}</td>
                <td className="text-right">{qtyText(l)}</td>
                <td className="text-right">{l.price ? fmtCOP(l.price) : ""}</td>
                {showIva && <td className="text-right">{l.price && l.ivaRate > 0 ? `${Math.round(l.ivaRate * 100)} %` : ""}</td>}
                <td className="text-right">{l.price && l.qtyKg ? fmtCOP(base(l) + vat(l)) : ""}</td>
              </tr>
            ))}
          </tbody>
          {subtotal > 0 && (
            <tfoot>
              {showIva && <><tr><td colSpan={5} className="pt-2 text-right">Subtotal</td><td className="pt-2 text-right">{fmtCOP(subtotal)}</td></tr>
                <tr><td colSpan={5} className="text-right">IVA</td><td className="text-right">{fmtCOP(iva)}</td></tr></>}
              <tr><td colSpan={showIva ? 5 : 4} className="pt-2 text-right font-semibold">{showIva ? "Total con IVA" : "Total estimado"}</td><td className="pt-2 text-right font-semibold">{fmtCOP(total)}</td></tr>
            </tfoot>
          )}
        </table>
        <p className="hidden pt-4 text-xs print:block">Por favor confirmar precio por kilo, {showIva ? "IVA, " : ""}forma de pago y tiempo de entrega.</p>

        {/* Pantalla: se edita */}
        <div className="print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-1">Producto</th><th>Cantidad (kg)</th><th>Precio por kg</th><th>IVA</th><th className="text-right">Total</th><th className="pl-3">Presentación del proveedor</th><th className="pl-3">Comparar</th><th /></tr></thead>
              <tbody>
                {lines.map((l) => {
                  const prices = l.rawMaterialId ? history.get(l.rawMaterialId) ?? [] : [];
                  const own = prices.find((p) => p.supplierId === q.supplierId);
                  const rec = own ? packRecommendation(l.qtyKg, own.packKg, own.kind) : null;
                  const others = prices.filter((p) => p.supplierId !== q.supplierId);
                  return (
                    <tr key={l.id} className="border-b align-top">
                      <td className="py-2 pr-2 font-medium">{l.name}
                        {own && <span className="block text-xs font-normal text-gray-500">{own.reference ? "Referencia" : "Última compra"} aquí: {fmtCOP(own.pricePerKg)}/kg · {own.date}</span>}
                        {!l.rawMaterialId && (
                          <form action={linkQuoteLine} className="mt-1 flex items-center gap-1 font-normal">
                            <input type="hidden" name="id" value={l.id} />
                            <select name="rawMaterialId" required defaultValue="" className="input !py-0.5 text-xs w-40" aria-label="Enlazar con un insumo">
                              <option value="" disabled>Sin insumo: enlazar…</option>
                              {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            <button className="text-xs underline">Enlazar</button>
                          </form>
                        )}
                        {l.rawMaterialId && !own && <span className="block text-xs font-normal text-gray-400">Sin precio de este proveedor en tus facturas ni referencias</span>}
                      </td>
                      <td colSpan={3} className="py-1">
                        <form action={saveQuoteLine} className="flex flex-wrap items-center gap-1">
                          <input type="hidden" name="id" value={l.id} />
                          <input name="qtyKg" inputMode="decimal" defaultValue={l.qtyKg} className="input !py-1 w-20" aria-label="Kilos" />
                          <input name="price" inputMode="numeric" defaultValue={l.price || ""} placeholder="$ por kg" className="input !py-1 w-28" aria-label="Precio por kilo" />
                          <select name="ivaRate" defaultValue={String(l.ivaRate)} className="input !py-1 w-20" aria-label="IVA">
                            <option value="0">—</option><option value="0.05">5 %</option><option value="0.19">19 %</option>
                          </select>
                          <button className="btn-secondary !px-2 !py-1 text-xs">Guardar</button>
                        </form>
                      </td>
                      <td className="py-2 text-right tabular-nums">{l.price && l.qtyKg ? fmtCOP(base(l) + vat(l)) : "—"}</td>
                      <td className="py-2 pl-3 text-xs">
                        {own && own.packKg && own.kind !== "kilo" ? (
                          <>
                            <span className="block font-medium">{own.kind[0].toUpperCase() + own.kind.slice(1)} de {own.packKg.toLocaleString("es-CO")} kg · {fmtCOP(own.unitPrice)} c/u</span>
                            {rec && !rec.exact && (
                              <form action={setQuoteQty} className="mt-0.5">
                                <input type="hidden" name="id" value={l.id} /><input type="hidden" name="qtyKg" value={rec.totalKg} />
                                <button className="underline">Pedir {rec.text}</button>
                              </form>
                            )}
                            {rec && rec.exact && <span className="text-gray-500">✓ {rec.text}</span>}
                          </>
                        ) : own ? <span className="text-gray-500">Por kilo</span> : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="py-2 pl-3 text-xs">
                        {others.length === 0 ? <span className="text-gray-400">—</span> : others.slice(0, 3).map((o) => (
                          <span key={o.supplierId} className="block">Comparar con {shortSupplierName(o.supplier)}: <strong>{fmtCOP(o.pricePerKg)}</strong>/kg</span>
                        ))}
                      </td>
                      <td className="py-1"><form action={removeQuoteLine}><input type="hidden" name="id" value={l.id} /><button className="text-xs text-gray-500 underline">Quitar</button></form></td>
                    </tr>
                  );
                })}
                {lines.length === 0 && <tr><td colSpan={8} className="py-3 text-center text-gray-500">Sin productos. Agrega abajo.</td></tr>}
              </tbody>
              {subtotal > 0 && (
                <tfoot>
                  {iva > 0 && <tr><td colSpan={4} className="pt-2 text-right text-gray-500">Subtotal {fmtCOP(subtotal)} + IVA {fmtCOP(iva)}</td><td colSpan={4} /></tr>}
                  <tr><td colSpan={4} className="pt-1 text-right font-semibold">{iva > 0 ? "Total con IVA" : "Total"}&nbsp;</td><td className="pt-1 text-right font-semibold tabular-nums">{fmtCOP(total)}</td><td colSpan={3} /></tr>
                </tfoot>
              )}
            </table>
          </div>

          <form action={addQuoteLine} className="mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
            <input type="hidden" name="quoteId" value={q.id} />
            <select name="rawMaterialId" className="input !py-1 text-sm" aria-label="Producto">
              <option value="">Otro producto (escribe el nombre)…</option>
              {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input name="name" placeholder="Nombre si es otro" className="input !py-1 w-40 text-sm" />
            <input name="qtyKg" inputMode="decimal" placeholder="kg" className="input !py-1 w-20 text-sm" />
            <button className="btn-secondary !px-2 !py-1 text-sm">Agregar producto</button>
          </form>

          <form action={saveQuoteNote} className="mt-3 space-y-1">
            <input type="hidden" name="id" value={q.id} />
            <label><span className="label">Nota para el proveedor (sale en el documento)</span>
              <textarea name="note" defaultValue={q.note ?? ""} rows={2} className="input" placeholder="Ej.: Entrega en la tienda de la Alameda, pago a 30 días." /></label>
            <button className="btn-secondary text-sm">Guardar nota</button>
          </form>
          <p className="mt-2 text-xs text-gray-500">La columna «Comparar» es solo para ti: no sale al imprimir.</p>
        </div>
      </article>
    </div>
  );
}
