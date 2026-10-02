import { requireAdmin } from "@/lib/session";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { packagingRuns, products } from "@/db/schema";
import { fmtNum, todayISO } from "@/lib/format";
import { PackForm } from "./pack-form";

export const metadata = { title: "Empaque · Vitalic Hub" };

export default async function EmpaquePage() {
  await requireAdmin();
  const [list, runs] = await Promise.all([
    db.select({ id: products.id, name: products.name }).from(products)
      .where(and(eq(products.active, true), isNotNull(products.rawMaterialId), isNotNull(products.grams)))
      .orderBy(asc(products.name)),
    db.select({ r: packagingRuns, name: products.name }).from(packagingRuns)
      .innerJoin(products, eq(packagingRuns.productId, products.id))
      .orderBy(desc(packagingRuns.createdAt)).limit(50),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Empaque</h1>
      <p className="text-sm text-muted">
        Cada vez que se empaca, registra cuántas bolsas salieron. Se descuentan los kilos del insumo; la merma es lo que
        se pierde al empacar.
      </p>
      <section className="card"><PackForm products={list} today={todayISO()} /></section>
      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Últimos registros</h2>
        <table className="table-base">
          <thead><tr><th>Fecha</th><th>Producto</th><th className="text-right">Bolsas</th><th className="text-right">Kg usados</th><th className="text-right">Merma</th></tr></thead>
          <tbody>
            {runs.map(({ r, name }) => (
              <tr key={r.id}>
                <td>{r.occurredOn}</td><td>{name}</td><td className="text-right">{r.bags}</td>
                <td className="text-right">{fmtNum(r.gramsUsed / 1000)}</td>
                <td className="text-right">{r.gramsUsed ? fmtNum((r.wasteGrams / r.gramsUsed) * 100) + " %" : "—"}</td>
              </tr>
            ))}
            {runs.length === 0 && <tr><td colSpan={5} className="text-muted">Aún no hay registros.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
