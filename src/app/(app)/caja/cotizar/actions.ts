"use server";

import { and, desc, eq, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { bulkSales, posSales, saleLines, stockMovements } from "@/db/schema";
import { todayISO } from "@/lib/format";
import { applyMovement } from "@/lib/inventory";
import { isPosMethod, SALE_LINE_METHOD } from "@/lib/pos";
import { requireAdmin, requireSession } from "@/lib/session";
import { quoteItems } from "./data";

/**
 * Pasa a las ventas de la caja una venta a granel que se registró solo en Cotizar (por eso no salía en las
 * ventas del día, el cuadre ni la utilidad). El inventario ya estaba descontado: aquí no se vuelve a descontar.
 */
export async function bulkToPosSale(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const method = String(formData.get("method") ?? "");
  if (!isPosMethod(method)) return;
  const [bs] = await db.select().from(bulkSales).where(eq(bulkSales.id, id));
  if (!bs || bs.posSaleId) return;
  const item = (await quoteItems()).find((i) => i.familyId === bs.familyId);
  if (!item) return;
  const gross = Math.round(bs.totalGross);
  const net = Math.round((gross / (1 + item.ivaRate)) * 100) / 100;
  const tax = Math.round((gross - net) * 100) / 100;
  await db.transaction(async (tx) => {
    const [sale] = await tx
      .insert(posSales)
      .values({
        soldAt: bs.createdAt, businessDate: bs.occurredOn, customer: bs.customer, subtotalNet: net, tax, total: gross,
        payments: JSON.stringify([{ method, amount: gross }]), cashReceived: method === "efectivo" ? gross : null, changeGiven: method === "efectivo" ? 0 : null,
        createdBy: bs.createdBy,
      })
      .returning({ id: posSales.id });
    await tx.insert(saleLines).values({
      externalKey: `V-${sale.id}|GRANEL-${item.familyId}|g1`, invoice: `V-${sale.id}`, soldAt: bs.createdAt, sku: `GRANEL-${item.familyId}`,
      productName: `${item.name} x kg`, category: "Granel", quantity: bs.kg, unitPriceNet: Math.round((net / bs.kg) * 100) / 100,
      unitCostNet: item.costPerKg, subtotalNet: net, tax, total: gross, paymentMethod: SALE_LINE_METHOD[method],
    });
    await tx.update(bulkSales).set({ posSaleId: sale.id }).where(eq(bulkSales.id, id));
  });
  revalidatePath("/caja/cotizar");
  revalidatePath("/caja");
  revalidatePath("/", "layout");
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
