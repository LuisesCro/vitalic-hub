import { requireAdmin } from "@/lib/session";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { rawMaterials } from "@/db/schema";
import { fmtCOP, fmtNum } from "@/lib/format";
import { rawMaterialConsumption, trackedRawMaterialIds } from "@/lib/reports";
import { recordCount, setBagStock } from "./actions";
import { products } from "@/db/schema";
import { isNotNull, and } from "drizzle-orm";
import { StockAlerts } from "@/components/stock-alerts";
import { stockAlerts } from "@/lib/stock-alerts";

export const metadata = { title: "Inventario · Vitalic Hub" };

const COVERAGE_ALERT_DAYS = 14;

export default async function InventarioPage() {
  await requireAdmin();
  const [materials, consumption, tracked] = await Promise.all([
    db.select().from(rawMaterials).where(eq(rawMaterials.active, true)).orderBy(asc(rawMaterials.name)),
    rawMaterialConsumption(90),
    trackedRawMaterialIds(),
  ]);
  const alerts = await stockAlerts({ insumos: true });
  const bags = await db.select({ id: products.id, name: products.name, stock: products.stockUnits }).from(products).where(and(eq(products.active, true), isNotNull(products.stockUnits))).orderBy(asc(products.stockUnits), asc(products.name));
  const rows = materials
    .map((m) => {
      const perDay = consumption.get(m.id) ?? 0;
      const coverage = perDay > 0 ? m.stockGrams / perDay : null;
      const counted = tracked.has(m.id);
      const low = counted && perDay > 0 && (m.stockGrams <= 0 || (m.minStockGrams > 0 && m.stockGrams <= m.minStockGrams) || (coverage !== null && coverage < COVERAGE_ALERT_DAYS));
      return { ...m, counted, perWeekKg: (perDay * 7) / 1000, coverage, low, value: (Math.max(m.stockGrams, 0) / 1000) * m.avgCostPerKg };
    })
    .sort((a, b) => Number(b.low) - Number(a.low) || b.perWeekKg - a.perWeekKg);
  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const toOrder = rows.filter((r) => r.low).length;
  const uncounted = rows.filter((r) => !r.counted && r.perWeekKg > 0).length;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Inventario de materia prima</h1>
      <StockAlerts alerts={alerts} limit={40} compact />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="card"><p className="label">Valor del inventario</p><p className="text-lg font-semibold">{fmtCOP(totalValue)}</p></div>
        <div className="card"><p className="label">Insumos para pedir</p><p className="text-lg font-semibold">{toOrder}</p></div>
        <div className="card"><p className="label">Insumos con venta sin conteo inicial</p><p className="text-lg font-semibold">{uncounted}</p></div>
      </div>
      <p className="text-sm text-muted">
        El consumo sale de las bolsas vendidas en los últimos 90 días. Las compras confirmadas suman kilos y el empaque
        los descuenta. Para corregir la existencia, escribe lo que hay físicamente y guarda.
      </p>
      <details className="card">
        <summary className="cursor-pointer font-semibold">Bolsas listas para vender ({bags.length}) · corregir cuántas hay</summary>
        <p className="mt-1 text-sm text-muted">Escribe cuántas bolsas hay en el mostrador. Si ya no hay, pon 0 y el producto sale como agotado.</p>
        <table className="table-base mt-2">
          <thead><tr><th>Producto</th><th className="text-right">Hay</th><th>Contar</th></tr></thead>
          <tbody>
            {bags.map((b) => (
              <tr key={b.id}>
                <td>{b.name}</td>
                <td className="text-right">{fmtNum(b.stock ?? 0)}</td>
                <td>
                  <form action={setBagStock} className="flex gap-1">
                    <input type="hidden" name="id" value={b.id} />
                    <input name="units" inputMode="decimal" placeholder="Hay" className="input w-20" />
                    <button className="btn-secondary">Guardar</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Insumo</th><th className="text-right">Existencia</th><th className="text-right">Consumo/semana</th>
              <th className="text-right">Cobertura</th><th className="text-right">Costo/kg</th><th>Conteo físico y mínimo (kg)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.low ? "bg-red-50 dark:bg-red-950/30" : ""}>
                <td>{r.name}</td>
                <td className="text-right">{r.counted ? `${fmtNum(r.stockGrams / 1000)} kg` : <span className="text-muted">Sin conteo</span>}</td>
                <td className="text-right">{r.perWeekKg ? `${fmtNum(r.perWeekKg)} kg` : "—"}</td>
                <td className="text-right">{!r.counted || r.coverage === null ? "—" : r.coverage <= 0 ? "Agotado" : `${fmtNum(r.coverage)} días`}</td>
                <td className="text-right">{fmtCOP(r.avgCostPerKg)}</td>
                <td>
                  <form action={recordCount} className="flex gap-1">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="counted" inputMode="decimal" placeholder="Hay" className="input w-20" />
                    <input name="min" inputMode="decimal" placeholder={`Mín ${fmtNum(r.minStockGrams / 1000)}`} className="input w-24" />
                    <button className="btn-secondary">Guardar</button>
                  </form>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-muted">Importa el catálogo de Vendty para crear los insumos.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
