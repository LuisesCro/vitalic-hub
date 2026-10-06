import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { marginOf } from "@/lib/catalog";
import { loadComponents, loadRawCosts } from "@/lib/components";
import { fmtCOP, fmtPct } from "@/lib/format";
import { sachetGramsFor } from "@/lib/sachet";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { SachetActions } from "./sachet-actions";

export const metadata = { title: "Sachets · Vitalic Hub" };

const fmtG = (g: number) => `${g.toLocaleString("es-CO", { maximumFractionDigits: 1 })} g`;

export default async function SachetsPage() {
  await requireAdmin();
  const s = await getSettings();
  const recipes = await loadComponents();
  const costs = await loadRawCosts();
  const rows = await db.select().from(products).where(and(eq(products.active, true), eq(products.format, "sachet"))).orderBy(asc(products.name));

  const data = rows.map((p) => {
    const comps = (recipes.get(p.id) ?? []).map((c) => ({ grams: c.grams, costPerKg: costs.get(c.rawMaterialId) ?? null }));
    const content = comps.reduce((t, c) => t + c.grams, 0);
    const single = comps.length === 1;
    const costPerKg = single && comps[0].costPerKg && comps[0].costPerKg > 0 ? comps[0].costPerKg : null;
    const priceGross = Math.round(p.priceNet * (1 + p.ivaRate));
    const rule = costPerKg !== null ? sachetGramsFor(costPerKg, s) : null;
    const costNow = costPerKg !== null ? (content / 1000) * costPerKg * (1 + s.mermaEmpaque) : null;
    const costRule = costPerKg !== null && rule !== null ? (rule / 1000) * costPerKg * (1 + s.mermaEmpaque) : null;
    return { p, single, content, costPerKg, priceGross, rule, costNow, costRule, marginNow: marginOf(priceGross, p.ivaRate, costNow), marginRule: marginOf(priceGross, p.ivaRate, costRule) };
  });
  const off = data.filter((d) => d.rule !== null && Math.abs(d.rule - d.content) > 0.01).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Sachets" subtitle="El sachet de $1.000: cuántos gramos lleva cada uno según la regla de costo.">
        <Link href="/catalogo" className="btn-secondary">← Catálogo</Link>
      </PageHeader>
      <p className="text-sm text-muted">
        <strong>Regla:</strong> todos los sachets pesan {s.sachetGramos} g. Si {s.sachetGramos} g del insumo cuestan más de {fmtCOP(s.sachetCostoUmbral)}, el sachet baja de gramos hasta quedar en unos {fmtCOP(s.sachetCostoMaximo)} de costo
        (al gramo más cercano). {data.length} sachets activos; <strong>{off}</strong> no están con el gramaje de la regla. Cuando suba o baje el costo de un insumo, vuelve a pulsar «Aplicar la regla».
      </p>
      <SachetActions />
      <section className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Sachet</th><th className="text-right">Costo/kg</th><th className="text-right">Lleva hoy</th><th className="text-right">Según la regla</th><th className="text-right">Costo con la regla</th><th className="text-right">Margen con la regla</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {data.map(({ p, single, content, costPerKg, rule, costRule, marginRule }) => {
              const ok = rule !== null && Math.abs(rule - content) <= 0.01;
              return (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td className="text-right tabular-nums">{costPerKg === null ? "—" : fmtCOP(Math.round(costPerKg))}</td>
                  <td className="text-right tabular-nums">{content ? fmtG(content) : "—"}</td>
                  <td className="text-right font-semibold tabular-nums">{rule === null ? "—" : fmtG(rule)}</td>
                  <td className="text-right tabular-nums">{costRule === null ? "—" : fmtCOP(Math.round(costRule))}</td>
                  <td className="text-right tabular-nums" style={{ color: marginRule === null ? undefined : marginRule < s.margenMinimo ? "var(--bad)" : "var(--good)" }}>{marginRule === null ? "—" : fmtPct(marginRule)}</td>
                  <td className="text-sm">{!single ? "Mezcla o sin receta: se revisa a mano" : costPerKg === null ? "Falta el costo del insumo" : ok ? "Bien" : `Cambiar a ${fmtG(rule!)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
