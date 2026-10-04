import "server-only";
import { db } from "@/db";
import { productComponents, products, rawMaterials } from "@/db/schema";

export type Component = { rawMaterialId: number; grams: number };

/**
 * Receta efectiva de cada producto: sus componentes guardados o, si no tiene,
 * el insumo y los gramos de siempre (productos simples traídos de Vendty).
 */
export async function loadComponents(): Promise<Map<number, Component[]>> {
  const rows = await db
    .select({ productId: productComponents.productId, rawMaterialId: productComponents.rawMaterialId, grams: productComponents.grams })
    .from(productComponents);
  const legacy = await db.select({ id: products.id, rawMaterialId: products.rawMaterialId, grams: products.grams }).from(products);
  const map = new Map<number, Component[]>();
  for (const r of rows) map.set(r.productId, [...(map.get(r.productId) ?? []), { rawMaterialId: r.rawMaterialId, grams: r.grams }]);
  for (const p of legacy) {
    if (!map.has(p.id) && p.rawMaterialId && p.grams) map.set(p.id, [{ rawMaterialId: p.rawMaterialId, grams: p.grams }]);
  }
  return map;
}

export async function loadRawCosts(): Promise<Map<number, number>> {
  const rows = await db.select({ id: rawMaterials.id, cost: rawMaterials.avgCostPerKg }).from(rawMaterials);
  return new Map(rows.map((r) => [r.id, r.cost]));
}
