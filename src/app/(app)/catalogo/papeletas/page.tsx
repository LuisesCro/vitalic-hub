import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { marginOf, papeletaMaxGrams } from "@/lib/catalog";
import { loadComponents, loadRawCosts } from "@/lib/components";
import { packagingCostFor } from "@/lib/settings-defaults";
import { fmtCOP, fmtPct } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Papeletas · Vitalic Hub" };

const fmtG = (g: number) => `${g.toLocaleString("es-CO", { maximumFractionDigits: 1 })} g`;

export default async function PapeletasPage() {
  await requireAdmin();
  const s = await getSettings();
  const recipes = await loadComponents();
  const costs = await loadRawCosts();
  const rows = await db.select().from(products).where(and(eq(products.active, true), eq(products.format, "papeleta"))).orderBy(asc(products.name));

  const data = rows.map((p) => {
    const comps = (recipes.get(p.id) ?? []).map((c) => ({ rawMaterialId: c.rawMaterialId, grams: c.grams, costPerKg: costs.get(c.rawMaterialId) ?? null }));
    const content = comps.reduce((t, c) => t + c.grams, 0);
    const known = comps.length > 0 && comps.every((c) => c.costPerKg && c.costPerKg > 0);
    const costPerKg = known && content > 0 ? comps.reduce((t, c) => t + (c.grams / 1000) * c.costPerKg!, 0) / (content / 1000) : null;
    const packaging = p.packagingCost || packagingCostFor(content || p.grams, s);
    const priceGross = Math.round(p.priceNet * (1 + p.ivaRate));
    const cost = costPerKg === null ? null : (content / 1000) * costPerKg * (1 + s.mermaEmpaque) + packaging;
    const margin = marginOf(priceGross, p.ivaRate, cost);
    const maxG = costPerKg === null ? null : papeletaMaxGrams({ priceGross, ivaRate: p.ivaRate, costPerKg, minMargin: s.margenMinimo, packagingCost: packaging, merma: s.mermaEmpaque });
    return { p, content, costPerKg, priceGross, margin, maxG, comps };
  });
  const ranked = [...data].sort((a, b) => (a.margin ?? 9) - (b.margin ?? 9));
  const below = data.filter((d) => d.margin !== null && d.margin < s.margenMinimo);

  return (
    <div className="space-y-4">
      <PageHeader title="Papeletas" subtitle={`Cuántos gramos puede llevar cada papeleta para dejar al menos ${fmtPct(s.margenMinimo)} de margen, con el costo actual del insumo.`}>
        <Link href="/catalogo" className="btn-secondary">← Catálogo</Link>
      </PageHeader>
      <p className="text-sm text-muted">
        {data.length} papeletas activas; <strong>{below.length}</strong> están por debajo del margen mínimo con el peso que llevan hoy. El «peso máximo» es el que deja justo el margen mínimo
        (con IVA del producto y {fmtPct(s.mermaEmpaque)} de merma); para empacar usa ese peso o un poco menos. Los pesos se cambian en cada producto, en la receta de la papeleta.
      </p>
      <section className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Papeleta</th><th className="text-right">Precio</th><th className="text-right">Costo/kg</th><th className="text-right">Lleva hoy</th><th className="text-right">Margen hoy</th><th className="text-right">Peso máximo</th><th>Qué hacer</th></tr>
          </thead>
          <tbody>
            {ranked.map(({ p, content, costPerKg, priceGross, margin, maxG }) => {
              const bad = margin !== null && margin < s.margenMinimo;
              const action = costPerKg === null ? "Falta la receta o el costo del insumo" : maxG === null ? "—" : maxG <= 0 ? "No deja margen ni con 1 g: subir el precio" : bad ? `Bajar a ${fmtG(Math.floor(maxG * 2) / 2)}${maxG < 5 ? " o subir el precio" : ""}` : maxG >= content + 2 ? `Cabe hasta ${fmtG(maxG)} (podrías dar más)` : "Bien";
              return (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-right tabular-nums">{fmtCOP(priceGross)}</td>
                  <td className="text-right tabular-nums">{costPerKg === null ? "—" : fmtCOP(Math.round(costPerKg))}</td>
                  <td className="text-right tabular-nums">{content ? fmtG(content) : "—"}</td>
                  <td className="text-right tabular-nums" style={{ color: margin === null ? undefined : bad ? "var(--bad)" : "var(--good)" }}>{margin === null ? "—" : fmtPct(margin)}</td>
                  <td className="text-right tabular-nums font-semibold">{maxG === null ? "—" : fmtG(maxG)}</td>
                  <td className="text-sm">{action}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
