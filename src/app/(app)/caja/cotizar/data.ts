import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productFamilies, products, rawMaterials } from "@/db/schema";
import { loadComponents, type Component } from "@/lib/components";
import { quoteBulk } from "@/lib/bulk";
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
