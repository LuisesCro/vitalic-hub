import Link from "next/link";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { quoteItems, quotes, suppliers } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { fmtCOP } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { generateQuote } from "./actions";

export const metadata = { title: "Cotizaciones · Vitalic Hub" };

const day = (d: Date) => d.toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const key = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });

export default async function CotizacionesPage() {
  await requireAdmin();
  const pending = await db
    .select({ item: quoteItems, supplier: suppliers.name })
    .from(quoteItems).innerJoin(suppliers, eq(suppliers.id, quoteItems.supplierId))
    .where(and(eq(quoteItems.status, "borrador"), isNull(quoteItems.quoteId)))
    .orderBy(suppliers.name, quoteItems.name);
  const bySupplier = new Map<number, { name: string; items: { name: string; qtyKg: number }[] }>();
  for (const p of pending) {
    const e = bySupplier.get(p.item.supplierId) ?? { name: p.supplier, items: [] };
    e.items.push({ name: p.item.name, qtyKg: p.item.qtyKg });
    bySupplier.set(p.item.supplierId, e);
  }

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
        <h2 className="font-semibold">Listas para cotizar</h2>
        {bySupplier.size === 0 ? (
          <p className="text-sm text-muted">Nada por cotizar. En «Por pedir» usa el botón <strong>Agregar</strong> junto a cada producto que se acaba y aparecerá aquí.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {[...bySupplier.entries()].map(([id, g]) => (
              <div key={id} className="space-y-2 rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-medium leading-tight">{g.name}</h3>
                  <form action={generateQuote}><input type="hidden" name="supplierId" value={id} /><button className="btn-primary text-sm">Generar cotización</button></form>
                </div>
                <ul className="text-sm text-muted">
                  {g.items.map((it) => <li key={it.name}>{it.name}{it.qtyKg ? ` · ${it.qtyKg.toLocaleString("es-CO")} kg` : ""}</li>)}
                </ul>
              </div>
            ))}
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
    </div>
  );
}
