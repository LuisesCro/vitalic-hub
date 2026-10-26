import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productFamilies, products, rawMaterials } from "@/db/schema";
import { loadComponents, type Component } from "@/lib/components";
import { quoteBulk } from "@/lib/bulk";
import { soldByWeight } from "@/lib/pos";
import type { Settings } from "@/lib/settings-defaults";

export type QuoteItem = {
  familyId: number;
  name: string;
  ivaRate: number;
  costPerKg: number; // materia prima sin IVA, mezcla según la receta
  retailPerKg: number | null; // de la bolsa más grande, con IVA
  retailLabel: string | null;
  stockKg: number | null; // kilos disponibles según el insumo que primero se acaba
  shares: { rawMaterialId: number; share: number }[];
};

/** Productos activos con receta, listos para cotizar por kilo. */
export async function quoteItems(): Promise<QuoteItem[]> {
  const recipes = await loadComponents();
  const families = await db.select().from(productFamilies).where(eq(productFamilies.active, true)).orderBy(asc(productFamilies.name));
  const items = await db.select().from(products).where(eq(products.active, true));
  const mats = await db.select({ id: rawMaterials.id, cost: rawMaterials.avgCostPerKg, stock: rawMaterials.stockGrams }).from(rawMaterials);
  const matById = new Map(mats.map((m) => [m.id, m]));
  const byFamily = new Map<number, typeof items>();
  for (const p of items) if (p.familyId) byFamily.set(p.familyId, [...(byFamily.get(p.familyId) ?? []), p]);

  const out: QuoteItem[] = [];
  for (const f of families) {
    const pres = (byFamily.get(f.id) ?? []).filter((p) => (recipes.get(p.id) ?? []).length && p.grams);
    if (!pres.length) continue;
    const ref = pres.reduce((a, b) => ((b.grams ?? 0) > (a.grams ?? 0) ? b : a));
    const comps: Component[] = recipes.get(ref.id)!;
    const total = comps.reduce((t, c) => t + c.grams, 0);
    const shares = comps.map((c) => ({ rawMaterialId: c.rawMaterialId, share: c.grams / total }));
    if (shares.some((s) => !(matById.get(s.rawMaterialId)?.cost ?? 0))) continue; // sin costo no se puede cotizar
    const costPerKg = shares.reduce((t, s) => t + s.share * matById.get(s.rawMaterialId)!.cost, 0);
    const bags = pres.filter((p) => p.format === "bolsa" && p.priceNet > 0);
    const big = bags.length ? bags.reduce((a, b) => ((b.grams ?? 0) > (a.grams ?? 0) ? b : a)) : null;
    const stocks = shares.map((s) => (matById.get(s.rawMaterialId)!.stock / 1000) / s.share);
    out.push({
      familyId: f.id,
      name: f.name,
      ivaRate: f.ivaRate,
      costPerKg,
      retailPerKg: big ? (big.priceNet * (1 + big.ivaRate) * 1000) / big.grams! : null,
      retailLabel: big ? `${big.name}` : null,
      stockKg: Math.max(0, Math.min(...stocks)),
      shares,
    });
  }
  return out;
}

export type { PublicQuoteItem } from "@/lib/bulk";
import type { PublicQuoteItem } from "@/lib/bulk";

/** Lo que llega al navegador: precios por nivel ya calculados; el costo solo si es administrador. */
export function toPublic(items: QuoteItem[], s: Settings, isAdmin: boolean): PublicQuoteItem[] {
  return items.flatMap((i) => {
    const at = (kg: number) => quoteBulk({ kg, costPerKg: i.costPerKg, ivaRate: i.ivaRate, retailPerKg: i.retailPerKg, settings: s });
    const levels = [at(1), at(s.granelDesdeKg2), at(s.granelDesdeKg3)];
    if (levels.some((l) => !l)) return [];
    return [{
      familyId: i.familyId, name: i.name, ivaRate: i.ivaRate, retailPerKg: i.retailPerKg, stockKg: i.stockKg,
      tiers: levels.map((l) => ({ pricePerKg: l!.pricePerKg, capped: l!.cappedByRetail })),
      floorPerKg: Math.min(...levels.map((l) => l!.floorPerKg)),
      ...(isAdmin ? { costPerKg: i.costPerKg } : {}),
    }];
  });
}

export type WholesaleKgRow = { name: string; code: string; retailPerKg: number; fromKg2: number; fromKg3: number };
export type WholesaleUnitRow = { name: string; code: string; unitPrice: number; from2: number; from3: number };
export type WholesaleList = {
  groups: { category: string; rows: WholesaleKgRow[] }[];
  units: WholesaleUnitRow[];
  /** Productos que con el descuento quedan por debajo del piso de margen, y los que quedan por debajo del costo. Solo para el administrador. */
  belowFloor: string[];
  belowCost: string[];
};

// Solo los códigos de Vitalic se muestran al cliente; los internos de proveedores quedan en blanco.
const publicCode = (sku: string) => (/^VTL-/i.test(sku) ? sku : "");
// Redondeo hacia arriba: a $100 en precios normales y a $10 en precios menores a $2.000, para que el descuento nunca deje el precio más alto que el original.
const PIECE = /astilla|pepitas?|turr[oó]n/i;
const roundUp100 = (v: number) => (v < 2000 ? Math.ceil(v / 10) * 10 : Math.ceil(v / 100) * 100);

/**
 * Lista de precios al por mayor para entregar a un cliente, con TODOS los productos que se venden (sin sachets).
 * Los de peso van por kilo con IVA (precio de la bolsa más grande menos el descuento de cada nivel); los que se venden por unidad
 * (mieles, salsas, aceites…) van por unidad con los mismos descuentos desde las mismas cantidades. Nunca incluye costos.
 */
export async function wholesaleList(s: Settings): Promise<WholesaleList> {
  const recipes = await loadComponents();
  const fams = new Map((await db.select().from(productFamilies)).map((f) => [f.id, f]));
  // Fuera de la lista mayorista por decisión del dueño: aceite de oliva, aceitunas, brevas, Nachili, alcaparras, cerezas 3A, duraznos, piña, stevia, kanawi y sacha inchi.
  const NOT_WHOLESALE = /aceite de oliva|aceituna|breva|\bn(a)?chili|alcaparra|cerezas?.*3a|duraznos? en mitades|pi[ñn]a (en )?rodajas|stevia|kanawi|sacha\s*inchi/i;
  const items = (await db.select().from(products).where(eq(products.active, true))).filter((p) => p.priceNet > 0 && p.format !== "sachet" && !NOT_WHOLESALE.test(p.name));
  const mats = new Map((await db.select({ id: rawMaterials.id, cost: rawMaterials.avgCostPerKg }).from(rawMaterials)).map((m) => [m.id, m.cost]));
  const gross = (p: (typeof items)[number]) => p.priceNet * (1 + p.ivaRate);
  const discounted = (price: number, d: number) => roundUp100(price * (1 - d));

  const byKey = new Map<string, typeof items>();
  for (const p of items) {
    const key = p.familyId && p.format === "bolsa" ? `f${p.familyId}` : `p${p.id}`;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }

  const cats = new Map<string, WholesaleKgRow[]>();
  const units: WholesaleUnitRow[] = [];
  const belowFloor: string[] = [], belowCost: string[] = [];
  for (const group of byKey.values()) {
    // Lo que se vende por pieza (una astilla, dos pepitas, un turrón) va por unidad aunque su ficha tenga gramos.
    const bags = group.filter((p) => p.format === "bolsa" && (p.grams ?? 0) > 0 && !PIECE.test(p.name));
    if (bags.length) {
      const big = bags.reduce((a, b) => ((b.grams ?? 0) > (a.grams ?? 0) ? b : a));
      const name = (big.familyId && fams.get(big.familyId)?.name) || big.name;
      const retail = Math.round((gross(big) * 1000) / big.grams!);
      const p2 = discounted(retail, s.descuentoMayorista2), p3 = discounted(retail, s.descuentoMayorista3);
      const comps = recipes.get(big.id) ?? [];
      const costKg = comps.length && comps.every((c) => mats.get(c.rawMaterialId)) ? comps.reduce((t, c) => t + (c.grams / 1000) * mats.get(c.rawMaterialId)!, 0) / (comps.reduce((t, c) => t + c.grams, 0) / 1000) : null;
      if (costKg) {
        const net = (price: number) => price / (1 + big.ivaRate);
        if (net(p3) < costKg) belowCost.push(name);
        else if (net(p3) < costKg / (1 - s.margenGranelPiso)) belowFloor.push(name);
      }
      const rawCat = big.category?.trim();
      const cat = !rawCat || /^general$/i.test(rawCat) ? "Otros productos" : rawCat;
      cats.set(cat, [...(cats.get(cat) ?? []), { name, code: publicCode(big.sku), retailPerKg: retail, fromKg2: p2, fromKg3: p3 }]);
    } else {
      for (const p of group) {
        if (soldByWeight(p.name) || /por peso/i.test(p.name)) {
          // Se vende por gramo: en la lista va por kilo, como los demás productos de peso.
          const retail = Math.round(gross(p) * 1000);
          const cat = p.category?.trim() && !/^general$/i.test(p.category.trim()) ? p.category.trim() : "Otros productos";
          cats.set(cat, [...(cats.get(cat) ?? []), { name: p.name, code: publicCode(p.sku), retailPerKg: retail, fromKg2: discounted(retail, s.descuentoMayorista2), fromKg3: discounted(retail, s.descuentoMayorista3) }]);
          continue;
        }
        const price = Math.round(gross(p));
        units.push({ name: p.name, code: publicCode(p.sku), unitPrice: price, from2: discounted(price, s.descuentoMayorista2), from3: discounted(price, s.descuentoMayorista3) });
      }
    }
  }
  const by = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "es");
  return {
    groups: [...cats.entries()].sort(([a], [b]) => a.localeCompare(b, "es")).map(([category, rows]) => ({ category, rows: rows.sort(by) })),
    units: units.sort(by),
    belowFloor: belowFloor.sort(), belowCost: belowCost.sort(),
  };
}
