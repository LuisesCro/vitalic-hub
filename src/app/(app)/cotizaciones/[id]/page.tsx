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
import { addQuoteLine, deleteQuote, removeQuoteLine, saveQuoteLine, saveQuoteNote, setQuoteStatus } from "../actions";
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
  const total = lines.reduce((t, l) => t + l.qtyKg * l.price, 0);
  const number = `COT-${q.id}`;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/cotizaciones" className="btn-secondary">← Cotizaciones</Link>
        <div className="flex flex-wrap gap-2">
          <PrintQuote />
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
          <thead><tr className="border-b border-black text-left"><th className="py-1">#</th><th>Producto</th><th className="text-right">Cantidad</th><th className="text-right">Precio por kg</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.id} className="border-b border-black/20">
                <td className="py-1">{i + 1}</td><td>{l.name}</td>
                <td className="text-right">{l.qtyKg ? `${l.qtyKg.toLocaleString("es-CO")} kg` : ""}</td>
                <td className="text-right">{l.price ? fmtCOP(l.price) : ""}</td>
                <td className="text-right">{l.price && l.qtyKg ? fmtCOP(l.price * l.qtyKg) : ""}</td>
              </tr>
            ))}
          </tbody>
          {total > 0 && <tfoot><tr><td colSpan={4} className="pt-2 text-right font-semibold">Estimado sin IVA</td><td className="pt-2 text-right font-semibold">{fmtCOP(total)}</td></tr></tfoot>}
        </table>
        <p className="hidden pt-4 text-xs print:block">Por favor confirmar precio por kilo, IVA, forma de pago y tiempo de entrega.</p>

        {/* Pantalla: se edita */}
        <div className="print:hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs text-gray-500"><th className="py-1">Producto</th><th>Cantidad (kg)</th><th>Precio por kg (sin IVA)</th><th className="text-right">Total</th><th>Comparar</th><th /></tr></thead>
              <tbody>
                {lines.map((l) => {
                  const prices = l.rawMaterialId ? history.get(l.rawMaterialId) ?? [] : [];
                  const own = prices.find((p) => p.supplierId === q.supplierId);
                  const others = prices.filter((p) => p.supplierId !== q.supplierId);
                  return (
                    <tr key={l.id} className="border-b align-top">
                      <td className="py-2 pr-2 font-medium">{l.name}{own && <span className="block text-xs font-normal text-gray-500">Última compra aquí: {fmtCOP(own.pricePerKg)}/kg · {own.date}</span>}</td>
                      <td colSpan={2} className="py-1">
                        <form action={saveQuoteLine} className="flex flex-wrap items-center gap-1">
                          <input type="hidden" name="id" value={l.id} />
                          <input name="qtyKg" inputMode="decimal" defaultValue={l.qtyKg} className="input !py-1 w-20" aria-label="Kilos" />
                          <input name="price" inputMode="numeric" defaultValue={l.price || ""} placeholder="$ por kg" className="input !py-1 w-28" aria-label="Precio por kilo" />
                          <button className="btn-secondary !px-2 !py-1 text-xs">Guardar</button>
                        </form>
                      </td>
                      <td className="py-2 text-right tabular-nums">{l.price && l.qtyKg ? fmtCOP(l.price * l.qtyKg) : "—"}</td>
                      <td className="py-2 pl-3 text-xs">
                        {others.length === 0 ? <span className="text-gray-400">—</span> : others.slice(0, 3).map((o) => (
                          <span key={o.supplierId} className="block">Comparar con {shortSupplierName(o.supplier)}: <strong>{fmtCOP(o.pricePerKg)}</strong>/kg</span>
                        ))}
                      </td>
                      <td className="py-1"><form action={removeQuoteLine}><input type="hidden" name="id" value={l.id} /><button className="text-xs text-gray-500 underline">Quitar</button></form></td>
                    </tr>
                  );
                })}
                {lines.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-gray-500">Sin productos. Agrega abajo.</td></tr>}
              </tbody>
              {total > 0 && <tfoot><tr><td colSpan={3} className="pt-2 text-right font-semibold">Estimado sin IVA</td><td className="pt-2 text-right font-semibold tabular-nums">{fmtCOP(total)}</td><td colSpan={2} /></tr></tfoot>}
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
