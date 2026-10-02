"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { products, rawMaterials, saleLines } from "@/db/schema";
import { matchRawMaterial } from "@/lib/matching";
import { requireSession } from "@/lib/session";
import { gramsFromName } from "@/lib/units";
import { parseInventoryCount, parseVendtyProducts, parseVendtyTransactions } from "@/lib/vendty";
import { applyMovement } from "@/lib/inventory";
import { todayISO } from "@/lib/format";
import { normalize } from "@/lib/units";

export type ImportState = { ok?: string; error?: string };

async function fileBytes(formData: FormData): Promise<Uint8Array | null> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  return new Uint8Array(await file.arrayBuffer());
}

export async function importProducts(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireSession();
  const bytes = await fileBytes(formData);
  if (!bytes) return { error: "Selecciona el archivo productos.xls de Vendty" };
  let rows;
  try {
    rows = parseVendtyProducts(bytes);
  } catch {
    return { error: "No pude leer el archivo. ¿Es la exportación de Productos de Vendty?" };
  }

  const ingredients = rows.filter((r) => r.isIngredient);
  for (const ing of ingredients) {
    // Vendty guarda el costo del ingrediente por gramo. Más de $1.000.000/kg indica un costo
    // cargado por unidad o por bulto: se deja en cero para que se corrija con la primera factura.
    const perKg = ing.costNet ? ing.costNet * 1000 : 0;
    const costPerKg = perKg > 1_000_000 ? 0 : perKg;
    await db
      .insert(rawMaterials)
      .values({ name: ing.name, vendtyCode: ing.sku, category: ing.category, avgCostPerKg: costPerKg })
      .onConflictDoUpdate({
        target: rawMaterials.name,
        set: { vendtyCode: ing.sku, avgCostPerKg: sql`case when ${rawMaterials.avgCostPerKg} = 0 then ${costPerKg} else ${rawMaterials.avgCostPerKg} end` },
      });
  }

  const materials = await db.select({ id: rawMaterials.id, name: rawMaterials.name }).from(rawMaterials);
  const sellable = rows.filter((r) => !r.isIngredient);
  let linked = 0;
  for (const p of sellable) {
    const material = matchRawMaterial(p.name, materials);
    if (material) linked++;
    const values = {
      sku: p.sku,
      name: p.name,
      category: p.category,
      grams: gramsFromName(p.name),
      priceNet: p.priceNet ?? 0,
      ivaRate: p.ivaRate,
      vendtyCost: p.costNet,
    };
    await db
      .insert(products)
      .values({ ...values, rawMaterialId: material?.id ?? null })
      .onConflictDoUpdate({
        target: products.sku,
        set: { ...values, rawMaterialId: sql`coalesce(${products.rawMaterialId}, ${material?.id ?? null})` },
      });
  }

  revalidatePath("/", "layout");
  return {
    ok: `Listo: ${sellable.length} productos y ${ingredients.length} insumos. ${linked} productos quedaron enlazados a su insumo.`,
  };
}

export async function importTransactions(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireSession();
  const bytes = await fileBytes(formData);
  if (!bytes) return { error: "Selecciona el archivo de transacciones de Vendty" };
  let rows;
  try {
    rows = parseVendtyTransactions(bytes);
  } catch {
    return { error: "No pude leer el archivo. ¿Es 'Exportar facturas (Transacciones)' de Vendty?" };
  }
  if (rows.length === 0) return { error: "El archivo no trae líneas de venta" };

  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db
      .insert(saleLines)
      .values(chunk)
      .onConflictDoUpdate({
        target: saleLines.externalKey,
        set: {
          quantity: sql`excluded.quantity`,
          unitPriceNet: sql`excluded.unit_price_net`,
          unitCostNet: sql`excluded.unit_cost_net`,
          subtotalNet: sql`excluded.subtotal_net`,
          tax: sql`excluded.tax`,
          total: sql`excluded.total`,
        },
      });
  }
  const dates = rows.map((r) => r.soldAt.getTime());
  const from = new Date(Math.min(...dates)).toISOString().slice(0, 10);
  const to = new Date(Math.max(...dates)).toISOString().slice(0, 10);
  const excluded = rows.filter((r) => r.excluded).length;
  revalidatePath("/", "layout");
  return {
    ok: `Listo: ${rows.length.toLocaleString("es-CO")} líneas de venta del ${from} al ${to}.${
      excluded ? ` ${excluded} quedaron excluidas por parecer ajustes de inventario.` : ""
    }`,
  };
}

export async function excludeSaleLine(formData: FormData) {
  await requireSession();
  const id = Number(formData.get("id"));
  await db.update(saleLines).set({ excluded: true, excludedReason: "Excluida a mano" }).where(eq(saleLines.id, id));
  revalidatePath("/", "layout");
}

/**
 * Inventario inicial o conteo general: deja cada insumo del archivo en la cantidad
 * contada y registra la diferencia como ajuste con fecha de hoy.
 */
export async function importInventory(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const session = await requireSession();
  const bytes = await fileBytes(formData);
  if (!bytes) return { error: "Selecciona el archivo de inventario" };
  let lines;
  try {
    lines = parseInventoryCount(bytes);
  } catch {
    return { error: "No pude leer el archivo. Usa la existencia de inventario de Vendty o una hoja con columnas Insumo y Kg." };
  }
  if (lines.length === 0) return { error: "El archivo no trae insumos con cantidad en kilos o gramos" };

  const materials = await db
    .select({ id: rawMaterials.id, name: rawMaterials.name, code: rawMaterials.vendtyCode })
    .from(rawMaterials);
  if (materials.length === 0) return { error: "Primero importa el catálogo de productos de Vendty" };
  const byCode = new Map(materials.filter((m) => m.code).map((m) => [m.code!.toLowerCase(), m]));
  const byName = new Map(materials.map((m) => [normalize(m.name), m]));

  const today = todayISO();
  const missing: string[] = [];
  let counted = 0;
  let negatives = 0;
  const seen = new Set<number>();
  await db.transaction(async (tx) => {
    for (const line of lines) {
      const material =
        (line.code && byCode.get(line.code.toLowerCase())) || byName.get(normalize(line.name)) || matchRawMaterial(line.name, materials);
      if (!material || seen.has(material.id)) {
        if (!material) missing.push(line.name);
        continue;
      }
      seen.add(material.id);
      // Una existencia negativa no es real: se toma como cero.
      if (line.grams < 0) negatives++;
      const target = Math.max(line.grams, 0);
      const [current] = await tx.select({ stock: rawMaterials.stockGrams }).from(rawMaterials).where(eq(rawMaterials.id, material.id));
      await applyMovement(tx, {
        rawMaterialId: material.id, occurredOn: today, kind: "ajuste", grams: target - current.stock,
        note: "Inventario inicial (archivo)", userId: session.userId,
      });
      counted++;
    }
  });

  revalidatePath("/", "layout");
  const parts = [`Listo: ${counted} insumos quedaron con la existencia del archivo (fecha ${today}).`];
  if (negatives) parts.push(`${negatives} venían en negativo y quedaron en 0.`);
  if (missing.length) {
    parts.push(`${missing.length} no los encontré en el catálogo: ${missing.slice(0, 8).join(", ")}${missing.length > 8 ? "…" : ""}.`);
  }
  return { ok: parts.join(" ") };
}
