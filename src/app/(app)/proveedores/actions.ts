"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { quoteItems, rawMaterials, suppliers } from "@/db/schema";
import { requireAdmin } from "@/lib/session";

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", ".")) || 0;

export type SupplierState = { ok?: string; error?: string };

/** Crea un proveedor o actualiza sus datos de contacto. */
export async function saveSupplier(_prev: SupplierState, formData: FormData): Promise<SupplierState> {
  await requireAdmin();
  const id = Number(formData.get("id")) || null;
  const name = String(formData.get("name") ?? "").trim();
  const nit = String(formData.get("nit") ?? "").replace(/[^0-9]/g, "") || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!name) return { error: "Escribe el nombre del proveedor" };
  try {
    if (id) await db.update(suppliers).set({ name, nit, phone, notes }).where(eq(suppliers.id, id));
    else await db.insert(suppliers).values({ name, nit, phone, notes });
  } catch {
    return { error: "Ya hay un proveedor con ese NIT" };
  }
  revalidatePath("/proveedores");
  return { ok: id ? "Proveedor actualizado" : `${name} quedó agregado` };
}

const refresh = () => {
  revalidatePath("/proveedores");
  revalidatePath("/por-pedir");
  revalidatePath("/cotizaciones");
};

/** Agrega un producto a la cotización de un proveedor (si ya estaba, le actualiza la cantidad). */
export async function addToQuote(formData: FormData) {
  const session = await requireAdmin();
  const supplierId = Number(formData.get("supplierId"));
  const rawMaterialId = Number(formData.get("rawMaterialId")) || null;
  const qtyKg = num(formData.get("qtyKg"));
  let name = String(formData.get("name") ?? "").trim();
  if (!supplierId) return;
  if (rawMaterialId) {
    const [m] = await db.select({ name: rawMaterials.name }).from(rawMaterials).where(eq(rawMaterials.id, rawMaterialId));
    name = m?.name ?? name;
  }
  if (!name) return;
  const open = and(eq(quoteItems.supplierId, supplierId), eq(quoteItems.status, "borrador"));
  const existing = (await db.select().from(quoteItems).where(open)).find((q) => (rawMaterialId ? q.rawMaterialId === rawMaterialId : q.name.toLowerCase() === name.toLowerCase()));
  // Si era un renglón del pedido automático, al tocarlo pasa a ser de quien lo editó y el HUB ya no lo cambia.
  if (existing) await db.update(quoteItems).set({ qtyKg, createdBy: session.userId }).where(eq(quoteItems.id, existing.id));
  else await db.insert(quoteItems).values({ supplierId, rawMaterialId, name, qtyKg, createdBy: session.userId });
  refresh();
}

export async function updateQuoteItem(formData: FormData) {
  const session = await requireAdmin();
  await db.update(quoteItems).set({ qtyKg: num(formData.get("qtyKg")), createdBy: session.userId }).where(eq(quoteItems.id, Number(formData.get("id"))));
  refresh();
}

/** Quita un renglón por pedir. Si lo había puesto el pedido automático, queda descartado unos días para que no vuelva solo. */
export async function removeQuoteItem(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const [it] = await db.select().from(quoteItems).where(eq(quoteItems.id, id));
  if (!it) return;
  if (it.createdBy === null && it.quoteId === null && it.status === "borrador") {
    await db.update(quoteItems).set({ status: "descartada", createdAt: new Date() }).where(eq(quoteItems.id, id));
  } else await db.delete(quoteItems).where(eq(quoteItems.id, id));
  refresh();
}

/** Edita un renglón por pedir: kilos y proveedor. Desde ese momento es una decisión de quien lo editó y el HUB no lo toca. */
export async function moveQuoteItem(formData: FormData) {
  const session = await requireAdmin();
  const id = Number(formData.get("id"));
  const supplierId = Number(formData.get("supplierId"));
  if (!id || !supplierId) return;
  const qty = formData.get("qtyKg");
  const qtyKg = qty === null ? null : num(qty);
  await db
    .update(quoteItems)
    .set({ supplierId, createdBy: session.userId, ...(qtyKg !== null && qtyKg > 0 ? { qtyKg } : {}) })
    .where(and(eq(quoteItems.id, id), eq(quoteItems.status, "borrador")));
  refresh();
}

/** La cotización ya se mandó: sus productos salen de la lista pendiente. */
export async function markQuoteSent(formData: FormData) {
  await requireAdmin();
  await db.update(quoteItems).set({ status: "enviada", sentAt: new Date() }).where(and(eq(quoteItems.supplierId, Number(formData.get("supplierId"))), eq(quoteItems.status, "borrador")));
  refresh();
}
