import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { purchaseLines, purchases, suppliers } from "@/db/schema";

export type KgPrice = { supplierId: number; supplier: string; pricePerKg: number; date: string | null };

/** "MANIMAX PALMIRA SAS" → "Manimax"; "JUAN CARLOS … (COMERCIAL SANTA INÉS)" → "Comercial Santa Inés". */
export function shortSupplierName(name: string): string {
  const inside = name.match(/\(([^)]+)\)/)?.[1];
  const base = (inside ?? name.split(/\s+/).slice(0, 1).join(" ")).toLowerCase();
  return base.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

/** Último precio por kilo (sin IVA) al que se compró cada insumo, por proveedor; el más reciente primero. */
export async function lastKgPrices(rawIds: number[]): Promise<Map<number, KgPrice[]>> {
  const out = new Map<number, KgPrice[]>();
  if (rawIds.length === 0) return out;
  const rows = await db
    .select({
      raw: purchaseLines.rawMaterialId, supplierId: purchases.supplierId, supplier: suppliers.name, date: purchases.issueDate,
      total: purchaseLines.lineTotal, qty: purchaseLines.quantity, kgPer: purchaseLines.kgPerUnit,
    })
    .from(purchaseLines)
    .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(inArray(purchaseLines.rawMaterialId, rawIds))
    .orderBy(desc(purchases.issueDate), desc(purchases.id));
  for (const r of rows) {
    if (!r.raw || !r.supplierId || !(r.kgPer && r.kgPer > 0) || !(r.qty > 0) || !(r.total > 0)) continue;
    const list = out.get(r.raw) ?? [];
    if (list.some((x) => x.supplierId === r.supplierId)) continue;
    list.push({ supplierId: r.supplierId, supplier: r.supplier, pricePerKg: Math.round(r.total / (r.qty * r.kgPer)), date: r.date });
    out.set(r.raw, list);
  }
  return out;
}
