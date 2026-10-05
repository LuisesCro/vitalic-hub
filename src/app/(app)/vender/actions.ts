"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { posSales, products, saleLines } from "@/db/schema";
import { loadComponents, loadRawCosts } from "@/lib/components";
import { unitCostFromComponents } from "@/lib/costing";
import { todayISO } from "@/lib/format";
import { SALE_LINE_METHOD, cartTotals, isPosMethod, lineGross, settle, soldByWeight, type PosMethod } from "@/lib/pos";
import { requireAdmin, requireSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { receiptTicket } from "./data";
import type { TicketData } from "@/components/ticket";

export type SaleState = { error?: string; receipt?: TicketData; saleId?: number; change?: number };

const Payload = z.object({
  lines: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive().max(100000) })).min(1, "El carrito está vacío"),
  discount: z.number().min(0).default(0),
  customer: z.string().trim().max(120).nullable().optional(),
  payments: z.array(z.object({ method: z.string().refine(isPosMethod, "Medio de pago no válido"), amount: z.number().min(0) })),
});

/** Registra una venta: los precios y costos salen de la base de datos, nunca del navegador. */
export async function createSale(_prev: SaleState, formData: FormData): Promise<SaleState> {
  const session = await requireSession();
  let payload;
  try {
    payload = Payload.parse(JSON.parse(String(formData.get("payload") ?? "{}")));
  } catch (error) {
    return { error: error instanceof z.ZodError ? error.issues[0]?.message : "Revisa la venta" };
  }
  const discount = session.role === "admin" ? payload.discount : 0; // solo administradores dan descuento

  const ids = [...new Set(payload.lines.map((l) => l.productId))];
  const rows = await db.select().from(products);
  const byId = new Map(rows.filter((p) => ids.includes(p.id)).map((p) => [p.id, p]));
  if (byId.size !== ids.length) return { error: "Un producto del carrito ya no existe" };
  const cartLines = payload.lines.map((l) => {
    const p = byId.get(l.productId)!;
    return { p, quantity: l.quantity, unitGross: Math.round(p.priceNet * (1 + p.ivaRate) * 100) / 100, ivaRate: p.ivaRate };
  });
  if (cartLines.some((l) => !(l.p.active && l.p.priceNet > 0))) return { error: "Hay un producto inactivo o sin precio en el carrito" };

  const totals = cartTotals(cartLines.map((l) => ({ unitGross: l.unitGross, quantity: l.quantity, ivaRate: l.ivaRate })), discount);
  const paid = settle(totals.total, payload.payments.map((p) => ({ method: p.method as PosMethod, amount: p.amount })));
  if (!paid.ok) return { error: paid.error };

  const settings = await getSettings();
  const recipes = await loadComponents();
  const rawCosts = await loadRawCosts();
  const factor = totals.gross > 0 ? totals.total / totals.gross : 0;
  const methodLabel = [...new Set(paid.paid.map((x) => SALE_LINE_METHOD[x.method]))].join(",");
  const today = todayISO();
  const now = new Date();

  const saleId = await db.transaction(async (tx) => {
    const [sale] = await tx
      .insert(posSales)
      .values({
        soldAt: now, businessDate: today, customer: payload.customer || null, subtotalNet: totals.net, tax: totals.tax, total: totals.total,
        payments: JSON.stringify(paid.paid), cashReceived: paid.cashReceived || null, changeGiven: paid.change || null, createdBy: session.userId,
      })
      .returning({ id: posSales.id });
    const rowsToInsert = cartLines.map((l, i) => {
      const comps = (recipes.get(l.p.id) ?? []).map((c) => ({ grams: c.grams, costPerKg: rawCosts.get(c.rawMaterialId) ?? null }));
      const cost = unitCostFromComponents(l.p, comps, settings) ?? 0;
      const gross = Math.round(lineGross({ unitGross: l.unitGross, quantity: l.quantity, ivaRate: l.ivaRate }) * factor);
      const net = Math.round((gross / (1 + l.ivaRate)) * 100) / 100;
      return {
        externalKey: `V-${sale.id}|${l.p.sku}|${i + 1}`, invoice: `V-${sale.id}`, soldAt: now, sku: l.p.sku, productName: l.p.name, category: l.p.category,
        quantity: l.quantity, unitPriceNet: l.p.priceNet, unitCostNet: soldByWeight(l.p.name) ? cost : cost, subtotalNet: net, tax: Math.round((gross - net) * 100) / 100,
        total: gross, paymentMethod: methodLabel,
      };
    });
    await tx.insert(saleLines).values(rowsToInsert);
    return sale.id;
  });

  revalidatePath("/vender");
  revalidatePath("/caja");
  revalidatePath("/");
  const [seller] = [session.name];
  return {
    saleId,
    change: paid.change,
    receipt: receiptTicket({
      id: saleId, soldAt: now, seller, customer: payload.customer || null, gross: totals.gross, discount: totals.discount, total: totals.total,
      lines: cartLines.map((l) => ({ name: l.p.name, qty: l.quantity, unit: l.unitGross, total: Math.round(lineGross({ unitGross: l.unitGross, quantity: l.quantity, ivaRate: l.ivaRate }) * factor), byWeight: soldByWeight(l.p.name) })),
      payments: paid.paid, cashReceived: paid.cashReceived, change: paid.change,
    }),
  };
}

/** Anula una venta (solo administradores): deja de contar en ventas, utilidad y cuadre. */
export async function voidSale(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const reason = String(formData.get("reason") ?? "").trim() || "Anulada por el administrador";
  await db.transaction(async (tx) => {
    await tx.update(posSales).set({ status: "anulada", voidReason: reason }).where(eq(posSales.id, id));
    await tx.update(saleLines).set({ excluded: true, excludedReason: `Venta anulada V-${id}: ${reason}` }).where(eq(saleLines.invoice, `V-${id}`));
  });
  revalidatePath("/vender");
  revalidatePath("/caja");
  revalidatePath("/");
}
