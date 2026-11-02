import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { purchaseLines, purchases, supplierPrices, suppliers } from "@/db/schema";

export type KgPrice = { supplierId: number; supplier: string; pricePerKg: number; date: string | null; reference?: boolean };

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
  const entries: (KgPrice & { raw: number })[] = [];
  for (const r of rows) {
    if (!r.raw || !r.supplierId || !(r.kgPer && r.kgPer > 0) || !(r.qty > 0) || !(r.total > 0)) continue;
    entries.push({ raw: r.raw, supplierId: r.supplierId, supplier: r.supplier, pricePerKg: Math.round(r.total / (r.qty * r.kgPer)), date: r.date });
  }
  // Precios de referencia (cotizaciones o facturas anteriores): solo ganan si son más recientes que las compras cargadas.
  const refs = await db
    .select({ raw: supplierPrices.rawMaterialId, supplierId: supplierPrices.supplierId, supplier: suppliers.name, date: supplierPrices.priceDate, price: supplierPrices.pricePerKg })
    .from(supplierPrices)
    .innerJoin(suppliers, eq(suppliers.id, supplierPrices.supplierId))
    .where(inArray(supplierPrices.rawMaterialId, rawIds))
    .orderBy(desc(supplierPrices.priceDate), desc(supplierPrices.id));
  for (const r of refs) {
    if (!r.raw || !r.price) continue;
    entries.push({ raw: r.raw, supplierId: r.supplierId, supplier: r.supplier, pricePerKg: r.price, date: r.date, reference: true });
  }
  // Más reciente primero; a igual fecha, la compra real antes que la referencia.
  entries.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || Number(!!a.reference) - Number(!!b.reference));
  for (const { raw, ...price } of entries) {
    const list = out.get(raw) ?? [];
    if (list.some((x) => x.supplierId === price.supplierId)) continue;
    list.push(price);
    out.set(raw, list);
  }
  return out;
}
