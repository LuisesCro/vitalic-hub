import "server-only";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { products, rawMaterials } from "@/db/schema";
import { soldByWeight } from "@/lib/pos";
import { rawMaterialConsumption, trackedRawMaterialIds } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { bagAlert, rawAlert, type AlertLevel } from "@/lib/stock-alert-rules";

export type StockAlert = {
  kind: "bolsa" | "insumo";
  id: number;
  name: string;
  /** Bolsas, o kilos para un insumo. */
  stock: number;
  unit: "bolsas" | "kg";
  level: AlertLevel;
  /** Días que alcanza al ritmo de venta; null si no hay venta reciente. */
  days: number | null;
};

/** Productos (bolsas con conteo) e insumos que se están acabando, primero los agotados y luego por menos días. */
export async function stockAlerts(opts: { insumos: boolean }): Promise<StockAlert[]> {
  const s = await getSettings();
  const out: StockAlert[] = [];

  const sold = await db.execute<{ sku: string; units: string }>(sql`
    select sku, sum(quantity) as units from sale_lines
    where not excluded and sold_at >= now() - interval '30 days' group by sku`);
  const perDay = new Map(sold.map((r) => [r.sku, Number(r.units) / 30]));
  const bags = await db.select().from(products).where(and(eq(products.active, true), isNotNull(products.stockUnits))).orderBy(asc(products.name));
  for (const p of bags) {
    if (p.stockUnits === null || soldByWeight(p.name)) continue;
    const a = bagAlert(p.stockUnits, perDay.get(p.sku) ?? 0, s.alertaBolsasMin, s.alertaBolsasDias);
    if (a) out.push({ kind: "bolsa", id: p.id, name: p.name, stock: p.stockUnits, unit: "bolsas", level: a.level, days: a.days });
  }

  if (opts.insumos) {
    const [materials, consumption, tracked] = await Promise.all([
      db.select().from(rawMaterials).where(eq(rawMaterials.active, true)),
      rawMaterialConsumption(90),
      trackedRawMaterialIds(),
    ]);
    for (const m of materials) {
      const rate = consumption.get(m.id) ?? 0;
      if (!tracked.has(m.id) || !(rate > 0 || m.minStockGrams > 0)) continue;
      const a = rawAlert(m.stockGrams, m.minStockGrams, rate, s.alertaInsumosDias);
      if (a) out.push({ kind: "insumo", id: m.id, name: m.name, stock: m.stockGrams / 1000, unit: "kg", level: a.level, days: a.days });
    }
  }

  return out.sort((a, b) => Number(b.level === "agotado") - Number(a.level === "agotado") || (a.days ?? 9999) - (b.days ?? 9999) || a.name.localeCompare(b.name));
}
