import { requireAdmin } from "@/lib/session";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { competitorPrices, competitors, products, rawMaterials } from "@/db/schema";
import { unitCost } from "@/lib/costing";
import { fmtCOP, fmtPct } from "@/lib/format";
import { margin, recommendPrice, RULE_LABELS } from "@/lib/pricing";
import { getSettings } from "@/lib/settings";
import { CompetitorForm } from "./competitor-form";

export const metadata = { title: "Precios · Vitalic Hub" };

const VIEWS = { cambios: "Con cambio", bajo: "Bajo el margen mínimo", todos: "Todos" } as const;
type View = keyof typeof VIEWS;

export default async function PreciosPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  await requireAdmin();
  const vista: View = ((await searchParams).vista as View) in VIEWS ? ((await searchParams).vista as View) : "cambios";
  const s = await getSettings();
  const [rows, prices] = await Promise.all([
    db.select({ p: products, rawCost: rawMaterials.avgCostPerKg }).from(products)
      .leftJoin(rawMaterials, eq(products.rawMaterialId, rawMaterials.id))
      .where(eq(products.active, true)),
    db.select({ productId: competitorPrices.productId, competitor: competitors.name, price: competitorPrices.priceGross, on: competitorPrices.capturedOn })
      .from(competitorPrices).innerJoin(competitors, eq(competitorPrices.competitorId, competitors.id))
      .orderBy(desc(competitorPrices.capturedOn), desc(competitorPrices.id)),
  ]);

  // Último precio de cada competidor por producto.
  const latest = new Map<number, Map<string, number>>();
  for (const cp of prices) {
    if (!cp.productId) continue;
    const byComp = latest.get(cp.productId) ?? new Map<string, number>();
    if (!byComp.has(cp.competitor)) byComp.set(cp.competitor, cp.price);
    latest.set(cp.productId, byComp);
  }

  const table = rows
    .filter(({ p }) => p.priceNet > 0)
    .map(({ p, rawCost }) => {
      const cost = unitCost(p, rawCost, s);
      const currentGross = Math.round(p.priceNet * (1 + p.ivaRate));
      const comp = latest.get(p.id) ?? new Map<string, number>();
      const rec = recommendPrice(
        { costNet: cost, currentPriceGross: currentGross, ivaRate: p.ivaRate, category: p.category, competitorPricesGross: [...comp.values()] },
        s,
      );
      return { p, cost, currentGross, currentMargin: cost !== null ? margin(p.priceNet, cost) : null, comp, rec };
    })
    .filter((r) =>
      vista === "todos" ? true : vista === "bajo" ? r.currentMargin !== null && r.currentMargin < s.margenMinimo : (r.rec.change ?? 0) !== 0,
    )
    .sort((a, b) => Math.abs(b.rec.change ?? 0) - Math.abs(a.rec.change ?? 0));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Precios</h1>
      <section className="card space-y-2">
        <h2 className="font-semibold">Cargar catálogo de la competencia</h2>
        <CompetitorForm />
      </section>
      <p className="text-sm text-muted">
        Regla: {fmtPct(s.posicionCompetencia)} frente al competidor más barato, sin bajar del margen mínimo de {fmtPct(s.margenMinimo)}.
        Sin competencia se usa el margen objetivo ({fmtPct(s.margenObjetivoFrutosSecos)} frutos secos, {fmtPct(s.margenObjetivoEspecias)} especias).
        {s.permitirBajarPrecios ? "" : " Hoy el motor no recomienda bajar precios (se cambia en Ajustes)."} Precios al público con IVA.
      </p>
      <div className="flex gap-2 text-sm">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={`/precios?vista=${v}`} className={vista === v ? "btn-primary" : "btn-secondary"}>{VIEWS[v]}</Link>
        ))}
      </div>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Producto</th><th className="text-right">Costo</th><th className="text-right">Precio actual</th><th className="text-right">Margen</th>
              <th>Competencia</th><th className="text-right">Recomendado</th><th className="text-right">Cambio</th><th className="text-right">Margen nuevo</th><th>Regla</th>
            </tr>
          </thead>
          <tbody>
            {table.slice(0, 400).map((r) => (
              <tr key={r.p.id}>
                <td className="min-w-44">{r.p.name}</td>
                <td className="text-right">{fmtCOP(r.cost)}</td>
                <td className="text-right">{fmtCOP(r.currentGross)}</td>
                <td className={`text-right ${r.currentMargin !== null && r.currentMargin < s.margenMinimo ? "text-red-600" : ""}`}>{fmtPct(r.currentMargin)}</td>
                <td className="text-xs">{[...r.comp.entries()].map(([c, v]) => `${c} ${fmtCOP(v)}`).join(" · ") || "—"}</td>
                <td className="text-right font-semibold">{fmtCOP(r.rec.recommendedGross)}</td>
                <td className={`text-right ${(r.rec.change ?? 0) > 0 ? "text-green-700 dark:text-green-400" : (r.rec.change ?? 0) < 0 ? "text-red-600" : ""}`}>
                  {r.rec.change ? `${r.rec.change > 0 ? "+" : ""}${fmtCOP(r.rec.change)}` : "—"}
                </td>
                <td className="text-right">{fmtPct(r.rec.marginAtRecommended)}</td>
                <td className="text-xs text-muted">{RULE_LABELS[r.rec.rule]}</td>
              </tr>
            ))}
            {table.length === 0 && <tr><td colSpan={9} className="text-muted">No hay productos en esta vista.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
