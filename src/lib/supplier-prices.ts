import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { purchaseLines, purchases, rawMaterials, supplierPrices, suppliers } from "@/db/schema";
import { packLabel, type PackKind } from "@/lib/pack";

export type KgPrice = {
  supplierId: number; supplier: string; pricePerKg: number; date: string | null; reference?: boolean;
  /** Cómo lo vende ese proveedor: precio por unidad (caja, bulto…), kilos que trae y tipo de empaque. */
  unitPrice: number; packKg: number | null; kind: PackKind;
};

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
      total: purchaseLines.lineTotal, qty: purchaseLines.quantity, kgPer: purchaseLines.kgPerUnit, description: purchaseLines.description, unit: purchaseLines.unit,
    })
    .from(purchaseLines)
    .innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
    .innerJoin(suppliers, eq(suppliers.id, purchases.supplierId))
    .where(inArray(purchaseLines.rawMaterialId, rawIds))
    .orderBy(desc(purchases.issueDate), desc(purchases.id));
  const entries: (KgPrice & { raw: number })[] = [];
  for (const r of rows) {
    if (!r.raw || !r.supplierId || !(r.kgPer && r.kgPer > 0) || !(r.qty > 0) || !(r.total > 0)) continue;
    entries.push({
      raw: r.raw, supplierId: r.supplierId, supplier: r.supplier, pricePerKg: Math.round(r.total / (r.qty * r.kgPer)), date: r.date,
      unitPrice: Math.round(r.total / r.qty), packKg: r.kgPer, kind: packLabel(r.description, r.unit, r.kgPer),
    });
  }
  // Precios de referencia (cotizaciones o facturas anteriores): solo ganan si son más recientes que las compras cargadas.
  const refs = await db
    .select({ raw: supplierPrices.rawMaterialId, supplierId: supplierPrices.supplierId, supplier: suppliers.name, date: supplierPrices.priceDate, price: supplierPrices.pricePerKg, unitPrice: supplierPrices.unitPrice, packKg: supplierPrices.packKg, description: supplierPrices.description })
    .from(supplierPrices)
    .innerJoin(suppliers, eq(suppliers.id, supplierPrices.supplierId))
    .where(inArray(supplierPrices.rawMaterialId, rawIds))
    .orderBy(desc(supplierPrices.priceDate), desc(supplierPrices.id));
  for (const r of refs) {
    if (!r.raw || !r.price) continue;
    entries.push({
      raw: r.raw, supplierId: r.supplierId, supplier: r.supplier, pricePerKg: r.price, date: r.date, reference: true,
      unitPrice: r.unitPrice, packKg: r.packKg, kind: packLabel(r.description, null, r.packKg),
    });
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

export type CatalogRow = {
  key: string; name: string; rawMaterialId: number | null; kind: PackKind; packKg: number | null;
  unitPrice: number; pricePerKg: number | null; date: string | null; reference: boolean;
  prevUnitPrice: number | null; prevPricePerKg: number | null; prevDate: string | null;
  /** Cambio frente al precio anterior (0,05 = subió 5 %); null si no hay dos precios. */
  change: number | null;
};

/** Todo lo que se le ha comprado (o cotizado) a un proveedor, con su último precio y el anterior. */
export async function supplierCatalog(supplierId: number): Promise<CatalogRow[]> {
  const lines = await db
    .select({
      raw: purchaseLines.rawMaterialId, description: purchaseLines.description, unit: purchaseLines.unit, date: purchases.issueDate,
      total: purchaseLines.lineTotal, qty: purchaseLines.quantity, kgPer: purchaseLines.kgPerUnit, id: purchases.id,
    })
    .from(purchaseLines).innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
    .where(eq(purchases.supplierId, supplierId));
  const refs = await db.select().from(supplierPrices).where(eq(supplierPrices.supplierId, supplierId));
  const raws = await db.select({ id: rawMaterials.id, name: rawMaterials.name }).from(rawMaterials);
  const rawName = new Map(raws.map((r) => [r.id, r.name]));

  type Offer = { key: string; name: string; raw: number | null; desc: string; unit: string | null; date: string | null; unitPrice: number; packKg: number | null; reference: boolean; order: number };
  const offers: Offer[] = [];
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, " ").trim();
  for (const l of lines) {
    if (!(l.qty > 0) || !(l.total > 0)) continue;
    offers.push({ key: l.raw ? `r${l.raw}-${l.kgPer ?? ""}` : `d${norm(l.description)}`, name: l.raw ? rawName.get(l.raw) ?? l.description : l.description, raw: l.raw, desc: l.description, unit: l.unit, date: l.date, unitPrice: l.total / l.qty, packKg: l.kgPer, reference: false, order: l.id });
  }
  for (const r of refs) {
    offers.push({ key: r.rawMaterialId ? `r${r.rawMaterialId}-${r.packKg ?? ""}` : `d${norm(r.description)}`, name: r.rawMaterialId ? rawName.get(r.rawMaterialId) ?? r.description : r.description, raw: r.rawMaterialId, desc: r.description, unit: null, date: r.priceDate, unitPrice: r.unitPrice, packKg: r.packKg, reference: true, order: -r.id });
  }
  offers.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || Number(a.reference) - Number(b.reference) || b.order - a.order);
  const groups = new Map<string, Offer[]>();
  for (const o of offers) groups.set(o.key, [...(groups.get(o.key) ?? []), o]);
  const perKg = (o: Offer) => (o.packKg && o.packKg > 0 ? Math.round(o.unitPrice / o.packKg) : null);
  const rows: CatalogRow[] = [];
  for (const [key, list] of groups) {
    const last = list[0];
    const prev = list.find((o) => o.date !== last.date || Math.round(o.unitPrice) !== Math.round(last.unitPrice)) ?? null;
    const prevOlder = prev && (prev.date ?? "") <= (last.date ?? "") ? prev : null;
    rows.push({
      key, name: last.name, rawMaterialId: last.raw, kind: packLabel(last.desc, last.unit, last.packKg), packKg: last.packKg,
      unitPrice: Math.round(last.unitPrice), pricePerKg: perKg(last), date: last.date, reference: last.reference,
      prevUnitPrice: prevOlder ? Math.round(prevOlder.unitPrice) : null, prevPricePerKg: prevOlder ? perKg(prevOlder) : null, prevDate: prevOlder?.date ?? null,
      change: prevOlder && prevOlder.unitPrice > 0 ? last.unitPrice / prevOlder.unitPrice - 1 : null,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
