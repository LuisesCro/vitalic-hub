"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { products, rawMaterials, saleLines } from "@/db/schema";
import { matchRawMaterial } from "@/lib/matching";
import { requireSession } from "@/lib/session";
import { gramsFromName } from "@/lib/units";
import { parseVendtyProducts, parseVendtyTransactions } from "@/lib/vendty";

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
