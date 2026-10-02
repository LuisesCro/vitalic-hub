import Link from "next/link";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { products, rawMaterials } from "@/db/schema";
import { fmtCOP, fmtNum, fmtPct } from "@/lib/format";
import { productPerformance } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { updateProduct } from "./actions";

export const metadata = { title: "Productos · Vitalic Hub" };

const VIEWS = { A: "Clase A", B: "Clase B", C: "Clase C", bajo: "Margen bajo", config: "Sin insumo o gramos" } as const;
type View = keyof typeof VIEWS;

export default async function ProductosPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const requested = (await searchParams).vista as View;
  const vista: View = requested in VIEWS ? requested : "A";
  const s = await getSettings();

  if (vista === "config") {
    const [list, materials] = await Promise.all([
      db.select().from(products).where(and(eq(products.active, true), or(isNull(products.rawMaterialId), isNull(products.grams)))).orderBy(asc(products.name)),
      db.select({ id: rawMaterials.id, name: rawMaterials.name }).from(rawMaterials).orderBy(asc(rawMaterials.name)),
    ]);
    return (
      <Shell vista={vista}>
        <p className="text-sm text-muted">
          Estos productos no tienen insumo o gramos, así que el empaque y el consumo no los cuentan. Productos de terceros
          (granola, aceites) pueden quedar sin insumo.
        </p>
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Producto</th><th>Insumo</th><th>Gramos</th><th /></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td colSpan={3}>
                    <form action={updateProduct} className="flex flex-wrap gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <select name="rawMaterialId" defaultValue={p.rawMaterialId ?? ""} className="input max-w-56">
                        <option value="">Sin insumo</option>
                        {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <input name="grams" inputMode="decimal" defaultValue={p.grams ?? ""} className="input w-24" placeholder="g" />
                      <button className="btn-secondary">Guardar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Shell>
    );
  }

  const all = await productPerformance(365);
  const rows = vista === "bajo" ? all.filter((r) => r.margin !== null && r.margin < s.margenMinimo) : all.filter((r) => r.abc === vista);
  const sales = rows.reduce((t, r) => t + r.sales, 0);
  const profit = rows.reduce((t, r) => t + (r.profit ?? 0), 0);
  return (
    <Shell vista={vista}>
      <p className="text-sm text-muted">
        Últimos 12 meses, sin IVA. A = productos que suman el 80 % de las ventas. {rows.length} productos · ventas {fmtCOP(sales)} · utilidad bruta {fmtCOP(profit)}.
      </p>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Producto</th><th>ABC</th><th className="text-right">Unidades</th><th className="text-right">Ventas</th><th className="text-right">Utilidad</th><th className="text-right">Margen</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku}>
                <td>{r.name}</td><td>{r.abc}</td><td className="text-right">{fmtNum(r.units)}</td>
                <td className="text-right">{fmtCOP(r.sales)}</td><td className="text-right">{fmtCOP(r.profit)}</td>
                <td className={`text-right ${r.margin !== null && r.margin < s.margenMinimo ? "text-red-600 font-semibold" : ""}`}>{r.margin === null ? "Sin costo" : fmtPct(r.margin)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-muted">Importa las ventas de Vendty para ver este reporte.</td></tr>}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function Shell({ vista, children }: { vista: View; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Productos</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link key={v} href={`/productos?vista=${v}`} className={vista === v ? "btn-primary" : "btn-secondary"}>{VIEWS[v]}</Link>
        ))}
      </div>
      {children}
    </div>
  );
}
