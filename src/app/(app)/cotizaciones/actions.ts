"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { quoteItems, quotes, rawMaterials, supplierPrices, suppliers } from "@/db/schema";
import { readInvoiceWithAI } from "@/lib/ai-invoice";
import { todayISO } from "@/lib/format";
import { matchRawMaterial } from "@/lib/matching";
import { kgPerInvoiceUnit } from "@/lib/units";
import { lastKgPrices } from "@/lib/supplier-prices";
import { requireAdmin } from "@/lib/session";

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const kgNum = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", ".")) || 0;
const refresh = (id?: number) => {
  revalidatePath("/cotizaciones");
  if (id) revalidatePath(`/cotizaciones/${id}`);
  revalidatePath("/por-pedir");
};

/** Precio por kilo con el que se compró la última vez a este proveedor (0 si nunca). */
async function lastPriceFrom(supplierId: number, rawId: number | null): Promise<number> {
  if (!rawId) return 0;
  const prices = (await lastKgPrices([rawId])).get(rawId) ?? [];
  return prices.find((p) => p.supplierId === supplierId)?.pricePerKg ?? 0;
}

/** Convierte lo que está por pedir a un proveedor en una cotización con número y fecha. */
export async function generateQuote(formData: FormData) {
  const session = await requireAdmin();
  const supplierId = Number(formData.get("supplierId"));
  const items = await db.select().from(quoteItems).where(and(eq(quoteItems.supplierId, supplierId), eq(quoteItems.status, "borrador"), isNull(quoteItems.quoteId)));
  if (!supplierId || items.length === 0) redirect("/cotizaciones");
  const raws = items.map((i) => i.rawMaterialId).filter((x): x is number => x !== null);
  const history = await lastKgPrices(raws);
  const [quote] = await db.insert(quotes).values({ supplierId, createdBy: session.userId }).returning({ id: quotes.id });
  for (const it of items) {
    const price = it.rawMaterialId ? (history.get(it.rawMaterialId) ?? []).find((p) => p.supplierId === supplierId)?.pricePerKg ?? 0 : 0;
    await db.update(quoteItems).set({ quoteId: quote.id, status: "cotizada", price }).where(eq(quoteItems.id, it.id));
  }
  refresh();
  redirect(`/cotizaciones/${quote.id}`);
}

export async function saveQuoteLine(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const iva = Number(formData.get("ivaRate"));
  const [line] = await db
    .update(quoteItems)
    .set({ qtyKg: kgNum(formData.get("qtyKg")), price: num(formData.get("price")), ...(iva === 0 || iva === 0.05 || iva === 0.19 ? { ivaRate: iva } : {}) })
    .where(eq(quoteItems.id, id))
    .returning({ quoteId: quoteItems.quoteId });
  refresh(line?.quoteId ?? undefined);
}

export async function removeQuoteLine(formData: FormData) {
  await requireAdmin();
  const [line] = await db.delete(quoteItems).where(eq(quoteItems.id, Number(formData.get("id")))).returning({ quoteId: quoteItems.quoteId });
  refresh(line?.quoteId ?? undefined);
}

/** Agrega un producto a una cotización ya generada, con el último precio pagado a ese proveedor. */
export async function addQuoteLine(formData: FormData) {
  const session = await requireAdmin();
  const quoteId = Number(formData.get("quoteId"));
  const rawMaterialId = Number(formData.get("rawMaterialId")) || null;
  let name = String(formData.get("name") ?? "").trim();
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) return;
  if (rawMaterialId) {
    const [m] = await db.select({ name: rawMaterials.name }).from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId));
    name = m?.name ?? name;
  }
  if (!name) return;
  await db.insert(quoteItems).values({
    supplierId: quote.supplierId, rawMaterialId, name, qtyKg: kgNum(formData.get("qtyKg")), quoteId, status: "cotizada",
    price: await lastPriceFrom(quote.supplierId, rawMaterialId), createdBy: session.userId,
  });
  refresh(quoteId);
}

export async function saveQuoteNote(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  await db.update(quotes).set({ note: String(formData.get("note") ?? "").trim() || null }).where(eq(quotes.id, id));
  refresh(id);
}

export async function setQuoteStatus(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const sent = String(formData.get("status")) === "enviada";
  await db.update(quotes).set({ status: sent ? "enviada" : "borrador", sentAt: sent ? new Date() : null }).where(eq(quotes.id, id));
  refresh(id);
}

export async function deleteQuote(formData: FormData) {
  await requireAdmin();
  await db.delete(quotes).where(eq(quotes.id, Number(formData.get("id"))));
  refresh();
  redirect("/cotizaciones");
}

/** Cómo vienen los precios de este proveedor: sin mostrar IVA, sumándolo, o ya con IVA incluido. No toca el IVA de los productos de Vitalic. */
export async function setSupplierIvaMode(formData: FormData) {
  await requireAdmin();
  const mode = String(formData.get("mode"));
  if (mode !== "ninguno" && mode !== "sumar" && mode !== "incluido") return;
  await db.update(suppliers).set({ ivaMode: mode }).where(eq(suppliers.id, Number(formData.get("supplierId"))));
  refresh(Number(formData.get("quoteId")) || undefined);
}

export type RefState = { ok?: string; error?: string };

const IMAGE_TYPES: Record<string, "image/jpeg" | "image/png" | "image/webp" | "image/gif"> = {
  "image/jpeg": "image/jpeg", "image/jpg": "image/jpeg", "image/png": "image/png", "image/webp": "image/webp", "image/gif": "image/gif",
};

/** Lee una cotización o factura anterior (foto o PDF) y guarda sus precios como referencia del proveedor. */
export async function uploadReferencePrices(_prev: RefState, formData: FormData): Promise<RefState> {
  await requireAdmin();
  const supplierId = Number(formData.get("supplierId"));
  const file = formData.get("file");
  if (!supplierId) return { error: "Escoge el proveedor" };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona la foto o el PDF" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  let parsed;
  try {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) parsed = await readInvoiceWithAI(bytes, "application/pdf");
    else if (IMAGE_TYPES[file.type]) parsed = await readInvoiceWithAI(bytes, IMAGE_TYPES[file.type]);
    else return { error: "Sube una foto (JPG o PNG) o un PDF" };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No pude leer el documento" };
  }
  const materials = await db.select({ id: rawMaterials.id, name: rawMaterials.name }).from(rawMaterials);
  const date = parsed.issueDate && /^\d{4}-\d{2}-\d{2}$/.test(parsed.issueDate) ? parsed.issueDate : todayISO();
  const rows = parsed.lines
    .filter((l) => l.description && l.unitPrice > 0)
    .map((l) => {
      const kg = kgPerInvoiceUnit(l.description, l.unit);
      return {
        supplierId, rawMaterialId: matchRawMaterial(l.description, materials)?.id ?? null, description: l.description.slice(0, 200),
        unitPrice: l.unitPrice, packKg: kg, pricePerKg: kg ? Math.round(l.unitPrice / kg) : null, priceDate: date, source: `foto-${todayISO()}`,
      };
    });
  if (rows.length === 0) return { error: "No encontré productos con precio en ese documento" };
  await db.insert(supplierPrices).values(rows);
  refresh();
  const matched = rows.filter((r) => r.rawMaterialId && r.pricePerKg).length;
  return { ok: `Guardé ${rows.length} precios con fecha ${date}; ${matched} quedaron enlazados a tus insumos y se usarán en las cotizaciones.` };
}

/** Pone en cada renglón sin precio el último precio de ese proveedor (compra o referencia). */
export async function fillQuotePrices(formData: FormData) {
  await requireAdmin();
  const quoteId = Number(formData.get("quoteId"));
  const [quote] = await db.select().from(quotes).where(eq(quotes.id, quoteId));
  if (!quote) return;
  const lines = await db.select().from(quoteItems).where(eq(quoteItems.quoteId, quoteId));
  const history = await lastKgPrices(lines.map((l) => l.rawMaterialId).filter((x): x is number => x !== null));
  for (const l of lines) {
    if (l.price > 0 || !l.rawMaterialId) continue;
    const own = (history.get(l.rawMaterialId) ?? []).find((p) => p.supplierId === quote.supplierId);
    if (own) await db.update(quoteItems).set({ price: own.pricePerKg }).where(eq(quoteItems.id, l.id));
  }
  refresh(quoteId);
}

/** Enlaza un renglón escrito a mano con un insumo, para que traiga su precio y su comparación. */
export async function linkQuoteLine(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const rawMaterialId = Number(formData.get("rawMaterialId"));
  if (!rawMaterialId) return;
  const [line] = await db.select().from(quoteItems).where(eq(quoteItems.id, id));
  const [quote] = line?.quoteId ? await db.select().from(quotes).where(eq(quotes.id, line.quoteId)) : [];
  if (!line || !quote) return;
  const [m] = await db.select({ name: rawMaterials.name }).from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId));
  await db.update(quoteItems).set({ rawMaterialId, name: m?.name ?? line.name, price: line.price > 0 ? line.price : await lastPriceFrom(quote.supplierId, rawMaterialId) }).where(eq(quoteItems.id, id));
  refresh(quote.id);
}

/** Cambia solo los kilos de un renglón (por ejemplo, a cajas o bultos completos). */
export async function setQuoteQty(formData: FormData) {
  await requireAdmin();
  const [line] = await db.update(quoteItems).set({ qtyKg: kgNum(formData.get("qtyKg")) }).where(eq(quoteItems.id, Number(formData.get("id")))).returning({ quoteId: quoteItems.quoteId });
  refresh(line?.quoteId ?? undefined);
}
