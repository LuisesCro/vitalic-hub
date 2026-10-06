"use server";

import { and, asc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { productComponents, productFamilies, products, rawMaterials } from "@/db/schema";
import { skuFor } from "@/lib/catalog";
import { loadComponents } from "@/lib/components";
import { matchRawMaterial } from "@/lib/matching";
import { sachetGramsFor } from "@/lib/sachet";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export type SachetState = { ok?: string; error?: string };

const SPICE_CATEGORY = /condiment|especia|hierba|ali[nñ]o/i;
// Familias del catálogo cuyo insumo se llama distinto.
const RAW_ALIAS: Record<string, string> = { "chile mirasol": "Chile Marisol", "chile mora": "Chile chipotle Mora", "chile carolina": "Chile Carolina Reaper" };

const fmtG = (g: number) => `${g.toLocaleString("es-CO", { maximumFractionDigits: 1 })} g`;

/** Aplica la regla de gramaje a todos los sachets de un solo insumo y los nombra «Producto sachet». */
export async function applySachetRule(_prev: SachetState): Promise<SachetState> {
  await requireAdmin();
  const s = await getSettings();
  const recipes = await loadComponents();
  const costs = new Map((await db.select({ id: rawMaterials.id, cost: rawMaterials.avgCostPerKg }).from(rawMaterials)).map((r) => [r.id, r.cost]));
  const fams = new Map((await db.select({ id: productFamilies.id, name: productFamilies.name }).from(productFamilies)).map((f) => [f.id, f.name]));
  const sachets = await db.select().from(products).where(and(eq(products.format, "sachet"), eq(products.active, true))).orderBy(asc(products.name));
  const changed: string[] = [];
  const noCost: string[] = [];
  let same = 0;
  let skipped = 0;
  await db.transaction(async (tx) => {
    for (const p of sachets) {
      const comps = recipes.get(p.id) ?? [];
      if (comps.length !== 1) { skipped++; continue; } // mezclas y sachets sin receta se revisan a mano
      const raw = comps[0].rawMaterialId;
      const cost = costs.get(raw) ?? 0;
      if (!(cost > 0)) noCost.push(p.name);
      const grams = sachetGramsFor(cost, s);
      const name = p.familyId && fams.get(p.familyId) ? `${fams.get(p.familyId)} sachet` : p.name;
      if (comps[0].grams === grams && p.grams === grams && p.name === name) { same++; continue; }
      await tx.update(products).set({ grams, rawMaterialId: raw, name }).where(eq(products.id, p.id));
      await tx.delete(productComponents).where(eq(productComponents.productId, p.id));
      await tx.insert(productComponents).values({ productId: p.id, rawMaterialId: raw, grams });
      if (comps[0].grams !== grams) changed.push(`${name.replace(/ sachet$/, "")} ${fmtG(comps[0].grams)}→${fmtG(grams)}`);
    }
  });
  revalidatePath("/catalogo", "layout");
  revalidatePath("/vender");
  const parts = [`Regla aplicada: ${changed.length} sachets cambiaron de gramaje, ${same} ya estaban bien${skipped ? `, ${skipped} se dejaron (mezclas o sin receta)` : ""}.`];
  if (changed.length) parts.push(`Cambios: ${changed.slice(0, 14).join("; ")}${changed.length > 14 ? "…" : ""}.`);
  if (noCost.length) parts.push(`Sin costo del insumo (quedaron en ${fmtG(s.sachetGramos)}): ${noCost.slice(0, 8).join(", ")}.`);
  return { ok: parts.join(" ") };
}

/** Crea un sachet de $1.000 para cada condimento o especia que todavía no lo tiene, ya con el gramaje de la regla. */
export async function createMissingSachets(_prev: SachetState): Promise<SachetState> {
  await requireAdmin();
  const s = await getSettings();
  const recipes = await loadComponents();
  const materials = await db.select({ id: rawMaterials.id, name: rawMaterials.name, cost: rawMaterials.avgCostPerKg }).from(rawMaterials);
  const costOf = new Map(materials.map((m) => [m.id, m.cost]));
  const allFams = await db.select().from(productFamilies).where(eq(productFamilies.active, true)).orderBy(asc(productFamilies.name));
  const fams = allFams.filter((f) => f.category && SPICE_CATEGORY.test(f.category));
  const prods = await db.select().from(products);
  const taken = new Set(prods.map((p) => p.sku));
  const byFamily = new Map<number, typeof prods>();
  for (const p of prods) if (p.familyId) byFamily.set(p.familyId, [...(byFamily.get(p.familyId) ?? []), p]);

  // Insumos que ya tienen sachet (de cualquier familia): un sachet por insumo.
  const rawWithSachet = new Set<number>();
  for (const p of prods) if (p.format === "sachet" && p.active) for (const c of recipes.get(p.id) ?? []) rawWithSachet.add(c.rawMaterialId);

  const created: string[] = [];
  const skipped: string[] = [];
  await db.transaction(async (tx) => {
    for (const f of fams) {
      const mine = byFamily.get(f.id) ?? [];
      if (mine.some((p) => p.format === "sachet")) continue;
      const rawIds = new Set(mine.flatMap((p) => (recipes.get(p.id) ?? []).map((c) => c.rawMaterialId)));
      let raw: number | null = rawIds.size === 1 ? [...rawIds][0] : null;
      if (rawIds.size > 1) { skipped.push(`${f.name} (mezcla)`); continue; }
      if (raw === null) {
        const alias = RAW_ALIAS[f.name.trim().toLowerCase()];
        raw = (alias ? materials.find((m) => m.name === alias)?.id : undefined) ?? matchRawMaterial(f.name, materials)?.id ?? null;
      }
      if (raw === null) { skipped.push(`${f.name} (sin insumo)`); continue; }
      if (rawWithSachet.has(raw)) { skipped.push(`${f.name} (ya hay un sachet de ese insumo)`); continue; }
      rawWithSachet.add(raw);
      const cost = costOf.get(raw) ?? 0;
      const grams = sachetGramsFor(cost, s);
      const sku = skuFor(f.name, grams, "sachet", taken);
      taken.add(sku);
      const [row] = await tx
        .insert(products)
        .values({
          sku, name: `${f.name} sachet`, category: f.category, grams, rawMaterialId: raw, ivaRate: f.ivaRate, format: "sachet", familyId: f.id,
          priceNet: Math.round((1000 / (1 + f.ivaRate)) * 100) / 100, active: true,
        })
        .returning({ id: products.id });
      await tx.insert(productComponents).values({ productId: row.id, rawMaterialId: raw, grams });
      created.push(`${f.name} (${fmtG(grams)}${cost > 0 ? "" : ", sin costo"})`);
    }
  });
  revalidatePath("/catalogo", "layout");
  revalidatePath("/vender");
  const parts = [created.length ? `Creé ${created.length} sachets de $1.000: ${created.slice(0, 20).join(", ")}${created.length > 20 ? "…" : ""}.` : "No faltaba ningún sachet."];
  if (skipped.length) parts.push(`No creé: ${skipped.join(", ")}.`);
  return { ok: parts.join(" ") };
}
