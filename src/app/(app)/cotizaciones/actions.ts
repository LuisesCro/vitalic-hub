"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { quoteItems, quotes, rawMaterials } from "@/db/schema";
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
  const [line] = await db.update(quoteItems).set({ qtyKg: kgNum(formData.get("qtyKg")), price: num(formData.get("price")) }).where(eq(quoteItems.id, id)).returning({ quoteId: quoteItems.quoteId });
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
