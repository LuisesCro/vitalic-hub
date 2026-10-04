"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { productComponents, productFamilies, products, rawMaterials } from "@/db/schema";
import {
  detectFormat, familyKey, familyNameOf, fmtGrams, isFormat, parseVendtyCompounds, skuFor, splitRecipe,
} from "@/lib/catalog";
import { todayISO } from "@/lib/format";
import { applyMovement } from "@/lib/inventory";
import { matchRawMaterial } from "@/lib/matching";
import { requireAdmin } from "@/lib/session";
import { normalize } from "@/lib/units";

export type CatalogState = { ok?: string; error?: string };

function refresh() {
  for (const path of ["/catalogo", "/precios", "/productos", "/empaque", "/inventario", "/"]) revalidatePath(path);
}

/** Agrupa en familias los productos que aún no tienen (los traídos de Vendty). */
async function organizePending(): Promise<number> {
  const pending = await db.select().from(products).where(isNull(products.familyId));
  if (pending.length === 0) return 0;
  const families = await db.select({ id: productFamilies.id, name: productFamilies.name }).from(productFamilies);
  const byKey = new Map(families.map((f) => [normalize(f.name), f.id]));
  for (const p of pending) {
    const name = familyNameOf(p.name) || p.name;
    const key = familyKey(p.name) || normalize(p.name);
    let familyId = byKey.get(key);
    if (!familyId) {
      const [created] = await db
        .insert(productFamilies)
        .values({ name, category: p.category, ivaRate: p.ivaRate })
        .onConflictDoNothing()
        .returning({ id: productFamilies.id });
      familyId = created?.id ?? (await db.select({ id: productFamilies.id }).from(productFamilies).where(eq(productFamilies.name, name)))[0]?.id;
      if (!familyId) continue;
      byKey.set(key, familyId);
    }
    const priceGross = p.priceNet * (1 + p.ivaRate);
    await db.update(products).set({ familyId, format: detectFormat(priceGross, p.grams) }).where(eq(products.id, p.id));
  }
  return pending.length;
}

export async function organizeCatalog(): Promise<void> {
  await requireAdmin();
  await organizePending();
  refresh();
}

/** Recetas del informe "Productos compuestos" de Vendty: gramos reales de cada insumo por presentación. */
export async function importVendtyRecipes(_prev: CatalogState, formData: FormData): Promise<CatalogState> {
  await requireAdmin();
  const compounds = parseVendtyCompounds(String(formData.get("text") ?? ""));
  if (compounds.length === 0) return { error: "No encontré recetas. Copia el informe completo de Productos compuestos de Vendty." };
  const [own, materials] = await Promise.all([
    db.select({ id: products.id, name: products.name }).from(products),
    db.select({ id: rawMaterials.id, name: rawMaterials.name }).from(rawMaterials),
  ]);
  const productByName = new Map(own.map((p) => [normalize(p.name), p.id]));
  const materialByName = new Map(materials.map((m) => [normalize(m.name), m.id]));
  let applied = 0;
  const missingProducts: string[] = [];
  const missingIngredients = new Set<string>();
  for (const c of compounds) {
    const productId = productByName.get(normalize(c.name));
    if (!productId) {
      missingProducts.push(c.name);
      continue;
    }
    const comps: { rawMaterialId: number; grams: number }[] = [];
    for (const part of c.components) {
      const id = materialByName.get(normalize(part.ingredient)) ?? matchRawMaterial(part.ingredient, materials)?.id;
      if (!id) missingIngredients.add(part.ingredient);
      else {
        const same = comps.find((x) => x.rawMaterialId === id);
        if (same) same.grams += part.grams;
        else comps.push({ rawMaterialId: id, grams: part.grams });
      }
    }
    if (comps.length !== c.components.length && comps.length === 0) continue;
    await db.transaction(async (tx) => {
      await tx.delete(productComponents).where(eq(productComponents.productId, productId));
      await tx.insert(productComponents).values(comps.map((x) => ({ productId, ...x })));
      await tx
        .update(products)
        .set({ grams: comps.reduce((t, x) => t + x.grams, 0), rawMaterialId: comps.length === 1 ? comps[0].rawMaterialId : null })
        .where(eq(products.id, productId));
    });
    applied++;
  }
  await organizePending();
  refresh();
  const parts = [`Listo: ${applied} recetas cargadas con los gramos reales de Vendty.`];
  if (missingProducts.length) parts.push(`${missingProducts.length} productos no están en el catálogo (p. ej. ${missingProducts.slice(0, 3).join(", ")}).`);
  if (missingIngredients.size) parts.push(`Insumos sin encontrar: ${[...missingIngredients].slice(0, 6).join(", ")}.`);
  return { ok: parts.join(" ") };
}

const Ref = z.union([z.number().int().positive(), z.string().min(1)]);
const PayloadSchema = z.object({
  id: z.number().int().positive().optional(),
  name: z.string().trim().min(2, "Escribe el nombre del producto"),
  category: z.string().trim().max(120).nullable(),
  ivaRate: z.union([z.literal(0), z.literal(0.05), z.literal(0.19)]),
  newMaterials: z.array(
    z.object({ ref: z.string(), name: z.string().trim().min(2), costPerKg: z.number().min(0), stockKg: z.number().min(0) }),
  ),
  recipe: z.array(z.object({ ref: Ref, parts: z.number().positive() })),
  presentations: z
    .array(
      z.object({
        id: z.number().int().positive().optional(),
        format: z.string().refine(isFormat, "Formato no válido"),
        grams: z.number().positive().nullable(),
        priceGross: z.number().positive("Escribe el precio de cada presentación"),
        sku: z.string().trim().max(60).optional(),
        active: z.boolean(),
        components: z.array(z.object({ ref: Ref, grams: z.number().positive() })).optional(),
      }),
    )
    .min(1, "Agrega al menos una presentación"),
});
export type FamilyPayload = z.input<typeof PayloadSchema>;

/** Crea o actualiza un producto con sus presentaciones, su receta y, si hay insumos nuevos, su inventario inicial. */
export async function saveFamily(_prev: CatalogState, formData: FormData): Promise<CatalogState> {
  const session = await requireAdmin();
  let payload;
  try {
    payload = PayloadSchema.parse(JSON.parse(String(formData.get("payload") ?? "{}")));
  } catch (error) {
    const issue = error instanceof z.ZodError ? error.issues[0]?.message : null;
    return { error: issue ?? "Revisa los datos del producto" };
  }
  for (const pr of payload.presentations) {
    if (pr.format !== "unidad" && !pr.grams) return { error: "Cada bolsa o papeleta necesita sus gramos" };
  }

  const existing = await db.select({ id: productFamilies.id }).from(productFamilies).where(eq(productFamilies.name, payload.name));
  if (existing[0] && existing[0].id !== payload.id) return { error: `Ya existe un producto llamado "${payload.name}". Búscalo en el catálogo y edítalo.` };

  const taken = new Set((await db.select({ sku: products.sku, id: products.id }).from(products)).map((p) => `${p.sku}`));
  const ownIds = new Set(payload.presentations.map((p) => p.id).filter(Boolean));
  for (const pr of payload.presentations) {
    if (!pr.sku) continue;
    const owner = await db.select({ id: products.id }).from(products).where(eq(products.sku, pr.sku));
    if (owner[0] && !ownIds.has(owner[0].id)) return { error: `El código ${pr.sku} ya lo usa otro producto` };
  }

  let familyId = payload.id;
  const today = todayISO();
  await db.transaction(async (tx) => {
    // 1. Producto madre.
    if (familyId) {
      await tx.update(productFamilies).set({ name: payload.name, category: payload.category, ivaRate: payload.ivaRate }).where(eq(productFamilies.id, familyId));
    } else {
      [{ id: familyId }] = await tx
        .insert(productFamilies)
        .values({ name: payload.name, category: payload.category, ivaRate: payload.ivaRate })
        .returning({ id: productFamilies.id });
    }

    // 2. Insumos nuevos, con su existencia y costo inicial.
    const refs = new Map<string | number, number>();
    for (const m of payload.newMaterials) {
      const [found] = await tx.select({ id: rawMaterials.id }).from(rawMaterials).where(eq(rawMaterials.name, m.name));
      const id = found?.id ?? (await tx.insert(rawMaterials).values({ name: m.name, category: payload.category, avgCostPerKg: m.costPerKg }).returning({ id: rawMaterials.id }))[0].id;
      refs.set(m.ref, id);
      if (m.stockKg > 0) {
        await applyMovement(tx, {
          rawMaterialId: id, occurredOn: today, kind: "entrada", grams: m.stockKg * 1000, costPerKg: m.costPerKg || null,
          note: `Inventario inicial al crear ${payload.name}`, userId: session.userId,
        });
      }
    }
    const resolve = (ref: string | number) => (typeof ref === "number" ? ref : refs.get(ref) ?? null);
    const recipe = payload.recipe.map((r) => ({ rawMaterialId: resolve(r.ref), parts: r.parts })).filter((r): r is { rawMaterialId: number; parts: number } => r.rawMaterialId !== null);

    // 3. Presentaciones con su receta en gramos.
    const keep: number[] = [];
    for (const pr of payload.presentations) {
      const format = pr.format as "bolsa" | "papeleta" | "unidad";
      const comps = pr.components?.length
        ? pr.components.map((c) => ({ rawMaterialId: resolve(c.ref), grams: c.grams })).filter((c): c is { rawMaterialId: number; grams: number } => c.rawMaterialId !== null)
        : pr.grams ? splitRecipe(recipe, pr.grams) : [];
      const grams = comps.length ? comps.reduce((t, c) => t + c.grams, 0) : pr.grams;
      const name = format === "unidad" ? payload.name : `${payload.name} ${format === "papeleta" ? "papeleta " : ""}${fmtGrams(grams)}`;
      const values = {
        name, category: payload.category, grams, ivaRate: payload.ivaRate, format, active: pr.active, familyId: familyId!,
        priceNet: Math.round((pr.priceGross / (1 + payload.ivaRate)) * 100) / 100,
        rawMaterialId: comps.length === 1 ? comps[0].rawMaterialId : null,
      };
      let productId = pr.id;
      if (productId) {
        await tx.update(products).set({ ...values, ...(pr.sku ? { sku: pr.sku } : {}) }).where(eq(products.id, productId));
      } else {
        const sku = pr.sku || skuFor(payload.name, grams, format, taken);
        taken.add(sku);
        [{ id: productId }] = await tx.insert(products).values({ ...values, sku }).returning({ id: products.id });
      }
      keep.push(productId!);
      await tx.delete(productComponents).where(eq(productComponents.productId, productId!));
      if (comps.length) await tx.insert(productComponents).values(comps.map((c) => ({ productId: productId!, ...c })));
    }

    // 4. Presentaciones quitadas del formulario: se dan de baja (no se borran, conservan su historial).
    const current = await tx.select({ id: products.id }).from(products).where(eq(products.familyId, familyId!));
    const removed = current.map((c) => c.id).filter((id) => !keep.includes(id));
    if (removed.length) await tx.update(products).set({ active: false }).where(inArray(products.id, removed));
  });

  refresh();
  redirect(`/catalogo/${familyId}?guardado=1`);
}

/** Dar de baja o reactivar un producto con todas sus presentaciones. */
export async function setFamilyActive(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  await db.transaction(async (tx) => {
    await tx.update(productFamilies).set({ active }).where(eq(productFamilies.id, id));
    if (active) {
      // Vuelven solo las presentaciones que estaban activas; las dadas de baja una a una siguen así.
      await tx.update(products).set({ active: true, pausedByFamily: false }).where(and(eq(products.familyId, id), eq(products.pausedByFamily, true)));
    } else {
      await tx.update(products).set({ active: false, pausedByFamily: true }).where(and(eq(products.familyId, id), eq(products.active, true)));
    }
  });
  refresh();
}
