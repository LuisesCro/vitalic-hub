import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { loadComponents } from "@/lib/components";
import { fmtCOP } from "@/lib/format";
import { auditGrams } from "@/lib/grams-audit";
import { requireAdmin } from "@/lib/session";
import { fixGrams } from "./actions";

export const metadata = { title: "Revisión de gramos · Vitalic Hub" };

export default async function RevisionPage() {
  await requireAdmin();
  const recipes = await loadComponents();
  const rows = await db.select().from(products).where(eq(products.active, true));
  const issues = rows
    .map((p) => {
      const comps = recipes.get(p.id) ?? [];
      const issue = auditGrams({ id: p.id, name: p.name, sku: p.sku, format: p.format, grams: p.grams, recipeGrams: comps.length ? comps.reduce((t, c) => t + c.grams, 0) : null });
      return issue ? { ...issue, price: Math.round(p.priceNet * (1 + p.ivaRate)) } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Number(b.suggested !== null) - Number(a.suggested !== null) || a.name.localeCompare(b.name, "es"));

  return (
    <div className="space-y-4">
      <PageHeader title="Revisión de gramos" subtitle="Presentaciones cuyos gramos no coinciden con su nombre, su código o su receta. Un gramaje mal cargado daña el costo, el margen, el inventario y la lista mayorista.">
        <Link href="/catalogo" className="btn-secondary">← Catálogo</Link>
      </PageHeader>
      <p className="text-sm text-muted">{issues.length} por revisar. Donde hay una sugerencia, dos de las tres fuentes (nombre, código, receta) coinciden entre sí.</p>
      <section className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Producto</th><th>Código</th><th className="text-right">Gramos hoy</th><th className="text-right">Precio</th><th>Por qué</th><th>Corregir</th></tr></thead>
          <tbody>
            {issues.map((i) => (
              <tr key={i.id}>
                <td className="min-w-44">{i.name}</td>
                <td className="text-xs text-muted">{i.sku}</td>
                <td className="text-right">{i.grams ?? "—"}</td>
                <td className="text-right">{fmtCOP(i.price)}</td>
                <td className="text-xs">{i.reasons.join(" · ")}</td>
                <td>
                  <form action={fixGrams} className="flex gap-1">
                    <input type="hidden" name="id" value={i.id} />
                    <input name="grams" inputMode="decimal" defaultValue={i.suggested ?? ""} placeholder="g" className="input w-20" />
                    <button className="btn-secondary">Guardar</button>
                  </form>
                </td>
              </tr>
            ))}
            {issues.length === 0 && <tr><td colSpan={6} className="text-muted">Todos los gramos coinciden.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
