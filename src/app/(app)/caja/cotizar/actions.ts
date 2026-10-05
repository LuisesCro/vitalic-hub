"use server";

import { and, desc, eq, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { bulkSales, stockMovements } from "@/db/schema";
import { quoteBulk } from "@/lib/bulk";
import { fmtCOP, todayISO } from "@/lib/format";
import { applyMovement } from "@/lib/inventory";
import { requireSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { quoteItems } from "./data";

export type BulkReceipt = { id: number; date: string; product: string; kg: number; total: number; perKg: number; customer: string | null; seller: string };
export type BulkState = { ok?: string; error?: string; receipt?: BulkReceipt };

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;

/** Venta por kilo o bulto: descuenta del inventario cada insumo en su proporción. */
export async function registerBulkSale(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const session = await requireSession();
  const familyId = Number(formData.get("familyId"));
  const kg = num(formData.get("kg"));
  const total = num(formData.get("total"));
  const customer = String(formData.get("customer") ?? "").trim() || null;
  const item = (await quoteItems()).find((i) => i.familyId === familyId);
  if (!item || !(kg > 0)) return { error: "Elige el producto y la cantidad" };
  const s = await getSettings();
  const quote = quoteBulk({ kg, costPerKg: item.costPerKg, ivaRate: item.ivaRate, retailPerKg: item.retailPerKg, settings: s });
  if (!quote) return { error: "Este producto no tiene costo; no se puede vender a granel todavía" };
  if (!(total > 0)) return { error: "Escribe el valor que paga el cliente" };
  if (total < quote.floorTotal && session.role !== "admin") {
    return { error: `El precio mínimo para ${kg} kg es ${fmtCOP(quote.floorTotal)}. Para un precio menor, pide autorización a Luis o Paula.` };
  }
  const today = todayISO();
  await db.transaction(async (tx) => {
    const [sale] = await tx
      .insert(bulkSales)
      .values({ occurredOn: today, familyId, kg, totalGross: total, suggestedGross: quote.total, customer, createdBy: session.userId })
      .returning({ id: bulkSales.id });
    for (const sh of item.shares) {
      await applyMovement(tx, {
        rawMaterialId: sh.rawMaterialId, occurredOn: today, kind: "venta", grams: -(kg * 1000 * sh.share),
        note: `Venta a granel #${sale.id}: ${kg} kg de ${item.name}${customer ? ` (${customer})` : ""}`, userId: session.userId,
      });
    }
  });
  revalidatePath("/caja/cotizar");
  revalidatePath("/inventario");
  const receiptId = (await db.select({ id: bulkSales.id }).from(bulkSales).orderBy(desc(bulkSales.id)).limit(1))[0]?.id ?? 0;
  return {
    receipt: { id: receiptId, date: today, product: item.name, kg, total, perKg: Math.round(total / kg), customer, seller: session.name },
    ok: `Registrado: ${kg.toLocaleString("es-CO")} kg de ${item.name} por ${fmtCOP(total)}. Ya se descontó del inventario. Factúralo en Vendty: producto «${item.name} x kg», cantidad ${kg.toLocaleString("es-CO")}, precio por kilo ${fmtCOP(Math.round(total / kg))}.`,
  };
}

/** Anular una venta a granel mal registrada: devuelve los kilos al inventario. */
export async function cancelBulkSale(formData: FormData) {
  const session = await requireSession();
  if (session.role !== "admin") return;
  const id = Number(formData.get("id"));
  const [sale] = await db.select().from(bulkSales).where(eq(bulkSales.id, id));
  if (!sale) return;
  // Devuelve exactamente lo que se descontó (aunque la receta haya cambiado después).
  const moves = await db
    .select({ rawMaterialId: stockMovements.rawMaterialId, grams: stockMovements.grams })
    .from(stockMovements)
    .where(and(eq(stockMovements.kind, "venta"), like(stockMovements.note, `Venta a granel #${sale.id}:%`)));
  await db.transaction(async (tx) => {
    for (const m of moves) {
      await applyMovement(tx, {
        rawMaterialId: m.rawMaterialId, occurredOn: todayISO(), kind: "ajuste", grams: -m.grams,
        note: `Anulación venta a granel #${sale.id}`, userId: session.userId,
      });
    }
    await tx.delete(bulkSales).where(eq(bulkSales.id, id));
  });
  revalidatePath("/caja/cotizar");
  revalidatePath("/inventario");
}
