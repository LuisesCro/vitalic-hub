"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { products, rawMaterials, saleLines } from "@/db/schema";
import { matchRawMaterial } from "@/lib/matching";
import { requireAdmin } from "@/lib/session";
import { gramsFromName } from "@/lib/units";
import { parseInventoryCount, parseVendtyProducts, parseVendtyTransactions } from "@/lib/vendty";
import { parseBagStock } from "@/lib/bag-stock";
import { parseVendtyClose } from "@/lib/vendty-close";
import { loadComponents, loadRawCosts } from "@/lib/components";
import { unitCostFromComponents } from "@/lib/costing";
import { getSettings } from "@/lib/settings";
import { matchProduct } from "@/lib/matching";
import { sql as dsql } from "drizzle-orm";
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
  await requireAdmin();
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
  await requireAdmin();
  const bytes = await fileBytes(formData);
  if (!bytes) return { error: "Selecciona el archivo de transacciones de Vendty" };
  let rows;
  try {
    rows = parseVendtyTransactions(bytes);
  } catch {
    return { error: "No pude leer el archivo. ¿Es 'Exportar facturas (Transacciones)' de Vendty?" };
  }
  if (rows.length === 0) return { error: "El archivo no trae líneas de venta" };

  // Si antes se cargaron cierres en PDF de esos mismos días, la exportación real los reemplaza.
  const days = [...new Set(rows.map((r) => bogotaDay(r.soldAt)))];
  for (const d of days) await db.delete(saleLines).where(eq(saleLines.invoice, `CIERRE-${d}`));

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
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db.update(saleLines).set({ excluded: true, excludedReason: "Excluida a mano" }).where(eq(saleLines.id, id));
  revalidatePath("/", "layout");
}

/**
 * Inventario inicial o conteo general: deja cada insumo del archivo en la cantidad
 * contada y registra la diferencia como ajuste con fecha de hoy.
 */
export async function importInventory(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const session = await requireAdmin();
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


const bogotaDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);

/**
 * Cierres de caja de Vendty en PDF: ventas por producto de cada día. Sirven cuando todavía no se tiene la
 * exportación de Transacciones. Los días que ya tienen ventas de Transacciones o de Vitalic Hub no se tocan.
 */
export async function importCloses(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Elige los PDF de cierre de caja de Vendty" };
  const { extractText, getDocumentProxy } = await import("unpdf");

  const settings = await getSettings();
  const recipes = await loadComponents();
  const rawCosts = await loadRawCosts();
  const prods = await db.select().from(products);
  const byName = new Map(prods.map((p) => [normalize(p.name), p]));
  const messages: string[] = [];
  let loaded = 0;
  let unmatched = 0;

  for (const file of files) {
    let close;
    try {
      const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
      close = parseVendtyClose((await extractText(pdf, { mergePages: true })).text);
    } catch {
      messages.push(`${file.name}: no pude leerlo como PDF.`);
      continue;
    }
    if (!close || close.items.length === 0) { messages.push(`${file.name}: no parece un cierre de caja de Vendty.`); continue; }
    const sum = close.items.reduce((t, i) => t + i.value, 0);
    if (Math.abs(sum - close.total) > 5) { messages.push(`${close.date}: los productos suman ${sum} y el total dice ${close.total}; no lo cargué.`); continue; }

    const [existing] = await db.execute<{ n: string; total: string }>(dsql`
      select count(*) as n, coalesce(sum(total), 0) as total from sale_lines
      where (sold_at at time zone 'America/Bogota')::date = ${close.date} and invoice not like 'CIERRE-%' and not excluded`);
    if (Number(existing.n) > 0) {
      messages.push(`${close.date}: ya tiene ventas cargadas (${Number(existing.total).toLocaleString("es-CO")} de ${close.total.toLocaleString("es-CO")} del cierre); no lo toqué.`);
      continue;
    }

    const soldAt = new Date(`${close.date}T12:00:00-05:00`);
    const rows = close.items.map((it, i) => {
      const prod = byName.get(normalize(it.name)) ?? matchProduct(it.name, gramsFromName(it.name), prods) ?? null;
      if (!prod) unmatched++;
      const iva = prod?.ivaRate ?? 0;
      const comps = prod ? (recipes.get(prod.id) ?? []).map((c) => ({ grams: c.grams, costPerKg: rawCosts.get(c.rawMaterialId) ?? null })) : [];
      const cost = prod ? unitCostFromComponents(prod, comps, settings) ?? 0 : 0;
      const net = Math.round((it.value / (1 + iva)) * 100) / 100;
      return {
        externalKey: `CIERRE-${close.date}|${i + 1}|${it.name}`, invoice: `CIERRE-${close.date}`, soldAt,
        sku: prod?.sku ?? "SIN-CODIGO", productName: prod?.name ?? it.name, category: prod?.category ?? null,
        quantity: it.quantity, unitPriceNet: Math.round(((it.value + it.discount) / it.quantity / (1 + iva)) * 100) / 100, unitCostNet: cost,
        subtotalNet: net, tax: Math.round((it.value - net) * 100) / 100, total: it.value, paymentMethod: null,
      };
    });
    await db.transaction(async (tx) => {
      await tx.delete(saleLines).where(eq(saleLines.invoice, `CIERRE-${close.date}`));
      for (let k = 0; k < rows.length; k += 200) await tx.insert(saleLines).values(rows.slice(k, k + 200));
    });
    loaded++;
    messages.push(`${close.date}: ${rows.length} líneas por ${close.total.toLocaleString("es-CO")} (${close.salesCount} ventas).`);
  }
  revalidatePath("/", "layout");
  return { ok: `${loaded} cierres cargados. ${messages.join(" ")}${unmatched ? ` ${unmatched} líneas no coincidieron con un producto del catálogo (cuentan en ventas, no en utilidad).` : ""}` };
}

/**
 * Bolsas listas para vender: toma la columna Unidades de la existencia de inventario de Vendty y deja cada
 * producto con ese conteo. Desde ahí la caja descuenta lo que vende y el empaque suma lo que se empaca.
 * Los negativos (ventas de más en Vendty) quedan en 0.
 */
export async function importBagStock(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireAdmin();
  const bytes = await fileBytes(formData);
  if (!bytes) return { error: "Selecciona el archivo de existencia de inventario" };
  let lines;
  try {
    lines = parseBagStock(bytes);
  } catch {
    return { error: "No pude leer el archivo. Usa la existencia de inventario de Vendty (con columnas Producto, Codigo y Unidades)." };
  }
  if (lines.length === 0) return { error: "No encontré las columnas Producto y Unidades en el archivo" };
  const prods = await db.select({ id: products.id, sku: products.sku, name: products.name }).from(products);
  const bySku = new Map(prods.map((p) => [p.sku.toLowerCase(), p]));
  const byName = new Map(prods.map((p) => [normalize(p.name), p]));
  let set = 0;
  let negatives = 0;
  const missing: string[] = [];
  const seen = new Set<number>();
  const batch: { id: number; units: number }[] = [];
  for (const l of lines) {
    const p = (l.code && bySku.get(l.code.toLowerCase())) || byName.get(normalize(l.name));
    if (!p) { missing.push(l.name); continue; }
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    if (l.units < 0) negatives++;
    batch.push({ id: p.id, units: Math.max(l.units, 0) });
  }
  if (batch.length) {
    await db.execute(dsql`
      update products p set stock_units = v.units
      from jsonb_to_recordset(${JSON.stringify(batch)}::jsonb) as v(id int, units numeric)
      where p.id = v.id`);
    set = batch.length;
  }
  revalidatePath("/", "layout");
  const parts = [`Listo: ${set} productos quedaron con su conteo de bolsas.`];
  if (negatives) parts.push(`${negatives} venían en negativo y quedaron en 0.`);
  if (missing.length) parts.push(`${missing.length} no los encontré en el catálogo: ${missing.slice(0, 6).join(", ")}${missing.length > 6 ? "…" : ""}.`);
  return { ok: parts.join(" ") };
}
