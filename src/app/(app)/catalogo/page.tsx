import Link from "next/link";
import { asc, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { productFamilies, products, rawMaterials } from "@/db/schema";
import { FORMATS, fmtGrams, marginOf, type Format } from "@/lib/catalog";
import { loadComponents } from "@/lib/components";
import { unitCostFromComponents } from "@/lib/costing";
import { fmtCOP, fmtPct } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { normalize } from "@/lib/units";
import { PageHeader } from "@/components/ui";
import { organizeCatalog } from "./actions";
import { RecipesImport } from "./recipes-import";

export const metadata = { title: "Catálogo · Vitalic Hub" };

const LIMIT = 60;

export default async function CatalogoPage({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; cat?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const estado = params.estado === "baja" ? "baja" : "activos";
  const cat = params.cat ?? "";

  const s = await getSettings();
  const recipes = await loadComponents();
  const families = await db.select().from(productFamilies).orderBy(asc(productFamilies.name));
  const items = await db.select().from(products).orderBy(asc(products.grams));
  const materials = await db.select({ id: rawMaterials.id, name: rawMaterials.name, cost: rawMaterials.avgCostPerKg }).from(rawMaterials);
  const [{ n: pending }] = await db.select({ n: count() }).from(products).where(isNull(products.familyId));

  const matById = new Map(materials.map((m) => [m.id, m]));
  const byFamily = new Map<number, typeof items>();
  for (const p of items) if (p.familyId) byFamily.set(p.familyId, [...(byFamily.get(p.familyId) ?? []), p]);
  const categories = [...new Set(families.map((f) => f.category).filter(Boolean))].sort() as string[];

  const needle = normalize(q);
  const filtered = families.filter(
    (f) =>
      (estado === "baja" ? !f.active : f.active) &&
      (!cat || f.category === cat) &&
      (!needle || normalize(f.name).includes(needle) || (byFamily.get(f.id) ?? []).some((p) => normalize(p.sku).includes(needle))),
  );
  const shown = filtered.slice(0, LIMIT);

  return (
    <div className="space-y-4">
      <PageHeader title="Catálogo" subtitle="Tus productos, sus presentaciones (125 g, 250 g, sachet…) y la receta de cada una.">
        <Link href="/catalogo/sachets" className="btn-secondary">Sachets $1.000</Link>
        <Link href="/catalogo/nuevo" className="btn-primary">+ Nuevo producto</Link>
      </PageHeader>

      {pending > 0 && (
        <form action={organizeCatalog} className="card flex flex-wrap items-center justify-between gap-3" style={{ background: "var(--warn-bg)" }}>
          <p className="text-sm">
            Hay <strong>{pending}</strong> presentaciones de Vendty sin organizar en productos. Las agrupo por nombre
            (Almendra 125 g, 250 g y 500 g quedan juntas en "Almendra").
          </p>
          <button className="btn-primary">Organizar ahora</button>
        </form>
      )}

      <form className="card flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1">
          <span className="label">Buscar</span>
          <input name="q" defaultValue={q} placeholder="Nombre o código" className="input" />
        </label>
        <label>
          <span className="label">Categoría</span>
          <select name="cat" defaultValue={cat} className="input">
            <option value="">Todas</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Estado</span>
          <select name="estado" defaultValue={estado} className="input">
            <option value="activos">Activos</option>
            <option value="baja">Dados de baja</option>
          </select>
        </label>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <p className="text-sm text-muted">
        {filtered.length} productos{filtered.length > LIMIT ? `; muestro los primeros ${LIMIT}, usa el buscador para encontrar otros` : ""}.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {shown.map((f) => {
          const pres = (byFamily.get(f.id) ?? []).filter((p) => (estado === "baja" ? true : p.active));
          const sample = pres.map((p) => recipes.get(p.id) ?? []).sort((a, b) => b.length - a.length)[0] ?? [];
          const total = sample.reduce((t, c) => t + c.grams, 0);
          return (
            <Link key={f.id} href={`/catalogo/${f.id}`} className="card block min-w-0 space-y-2 transition-colors hover:border-brand-500">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{f.name}</p>
                  <p className="truncate text-xs text-muted">{f.category ?? "Sin categoría"} · IVA {fmtPct(f.ivaRate)}</p>
                </div>
                {!f.active && <span className="badge" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>De baja</span>}
              </div>
              <p className="truncate text-xs text-muted">
                {sample.length === 0
                  ? "Sin receta (producto de terceros o por completar)"
                  : sample.length === 1
                    ? `Insumo: ${matById.get(sample[0].rawMaterialId)?.name ?? "—"}`
                    : `Receta: ${sample.map((c) => `${matById.get(c.rawMaterialId)?.name ?? "—"} ${Math.round((c.grams / total) * 100)} %`).join(", ")}`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {pres.map((p) => {
                  const gross = Math.round(p.priceNet * (1 + p.ivaRate));
                  const comps = (recipes.get(p.id) ?? []).map((c) => ({ grams: c.grams, costPerKg: matById.get(c.rawMaterialId)?.cost ?? null }));
                  const cost = unitCostFromComponents(p, comps, s);
                  const m = marginOf(gross, p.ivaRate, cost);
                  const profit = cost === null ? null : gross / (1 + p.ivaRate) - cost;
                  const color = m === null ? "var(--muted)" : m < s.margenMinimo ? "var(--bad)" : "var(--good)";
                  return (
                    <span key={p.id} className={`rounded-lg border border-[var(--border)] px-2 py-1 text-xs tabular-nums ${p.active ? "" : "opacity-50 line-through"}`}>
                      {p.format === "sachet" ? "Sachet " : p.format === "unidad" ? `${FORMATS[p.format as Format]} ` : ""}
                      {p.format !== "unidad" && fmtGrams(p.grams)} · {fmtCOP(gross)} · <span style={{ color }}>{m === null ? "sin costo" : `gana ${fmtCOP(profit)} (${fmtPct(m)})`}</span>
                    </span>
                  );
                })}
                {pres.length === 0 && <span className="text-xs text-muted">Sin presentaciones activas</span>}
              </div>
            </Link>
          );
        })}
      </div>
      {shown.length === 0 && <p className="card text-center text-sm text-muted">No hay productos con ese filtro.</p>}

      <RecipesImport />
    </div>
  );
}
