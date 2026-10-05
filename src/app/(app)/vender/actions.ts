"use server";

import { and, eq, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { bulkSales, posSales, products, saleLines, stockMovements } from "@/db/schema";
import { loadComponents, loadRawCosts } from "@/lib/components";
import { quoteBulk } from "@/lib/bulk";
import { unitCostFromComponents } from "@/lib/costing";
import { applyMovement } from "@/lib/inventory";
import { fmtCOP, todayISO } from "@/lib/format";
import { SALE_LINE_METHOD, cartTotals, isPosMethod, lineGross, settle, soldByWeight, type PosMethod } from "@/lib/pos";
import { requireAdmin, requireSession } from "@/lib/session";
import { getSettings } from "@/lib/settings";
import { quoteItems } from "../caja/cotizar/data";
import { receiptTicket } from "./data";
import type { TicketData } from "@/components/ticket";

export type SaleState = { error?: string; receipt?: TicketData; saleId?: number; change?: number };

const Payload = z.object({
  lines: z.array(z.object({ productId: z.number().int().positive(), quantity: z.number().positive().max(100000) })).default([]),
  bulkLines: z.array(z.object({ familyId: z.number().int().positive(), kg: z.number().positive().max(2000), total: z.number().positive().max(200000000) })).default([]),
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
  if (payload.lines.length + payload.bulkLines.length === 0) return { error: "El carrito está vacío" };
  const isAdmin = session.role === "admin";

  const ids = [...new Set(payload.lines.map((l) => l.productId))];
  const rows = await db.select().from(products);
  const byId = new Map(rows.filter((p) => ids.includes(p.id)).map((p) => [p.id, p]));
  if (byId.size !== ids.length) return { error: "Un producto del carrito ya no existe" };
  const cartLines = payload.lines.map((l) => {
    const p = byId.get(l.productId)!;
    return { p, quantity: l.quantity, unitGross: Math.round(p.priceNet * (1 + p.ivaRate) * 100) / 100, ivaRate: p.ivaRate };
  });
  if (cartLines.some((l) => !(l.p.active && l.p.priceNet > 0))) return { error: "Hay un producto inactivo o sin precio en el carrito" };

  const settings = await getSettings();
  // Granel / bulto: el precio sugerido sale del servidor; la cajera no puede bajar del precio mínimo.
  const quotes = payload.bulkLines.length ? await quoteItems() : [];
  const bulkCart: { item: (typeof quotes)[number]; kg: number; total: number; suggested: number }[] = [];
  for (const b of payload.bulkLines) {
    const item = quotes.find((q) => q.familyId === b.familyId);
    const quote = item && quoteBulk({ kg: b.kg, costPerKg: item.costPerKg, ivaRate: item.ivaRate, retailPerKg: item.retailPerKg, settings });
    if (!item || !quote) return { error: "Un producto a granel ya no se puede vender (revisa su receta y costo)" };
    const total = Math.round(b.total);
    if (!isAdmin && total < quote.floorTotal) return { error: `El mínimo para ${b.kg} kg de ${item.name} es ${fmtCOP(quote.floorTotal)}. Pide autorización a Luis o Paula.` };
    bulkCart.push({ item, kg: b.kg, total, suggested: quote.total });
  }
  const productGross = cartLines.reduce((t, l) => t + lineGross({ unitGross: l.unitGross, quantity: l.quantity, ivaRate: l.ivaRate }), 0);
  // La cajera puede dar un descuento pequeño sobre productos; el granel ya trae su margen ajustado.
  const maxDiscount = isAdmin ? Infinity : Math.floor(productGross * settings.descuentoMaxCajera);
  if (payload.discount > maxDiscount) return { error: `Tu descuento máximo es ${fmtCOP(maxDiscount)} (${Math.round(settings.descuentoMaxCajera * 100)} %). Para más, pide autorización a Luis o Paula.` };
  const discount = payload.discount;

  const totals = cartTotals(
    [...cartLines.map((l) => ({ unitGross: l.unitGross, quantity: l.quantity, ivaRate: l.ivaRate })), ...bulkCart.map((b) => ({ unitGross: b.total, quantity: 1, ivaRate: b.item.ivaRate }))],
    discount,
  );

  const paid = settle(totals.total, payload.payments.map((p) => ({ method: p.method as PosMethod, amount: p.amount })));
  if (!paid.ok) return { error: paid.error };

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
    for (const [j, b] of bulkCart.entries()) {
      const gross = Math.round(b.total * factor);
      const net = Math.round((gross / (1 + b.item.ivaRate)) * 100) / 100;
      rowsToInsert.push({
        externalKey: `V-${sale.id}|GRANEL-${b.item.familyId}|g${j + 1}`, invoice: `V-${sale.id}`, soldAt: now, sku: `GRANEL-${b.item.familyId}`, productName: `${b.item.name} x kg`, category: "Granel",
        quantity: b.kg, unitPriceNet: Math.round((net / b.kg) * 100) / 100, unitCostNet: b.item.costPerKg, subtotalNet: net, tax: Math.round((gross - net) * 100) / 100,
        total: gross, paymentMethod: methodLabel,
      });
      const [bs] = await tx
        .insert(bulkSales)
        .values({ occurredOn: today, familyId: b.item.familyId, kg: b.kg, totalGross: gross, suggestedGross: b.suggested, customer: payload.customer || null, createdBy: session.userId, posSaleId: sale.id })
        .returning({ id: bulkSales.id });
      for (const sh of b.item.shares) {
        await applyMovement(tx, {
          rawMaterialId: sh.rawMaterialId, occurredOn: today, kind: "venta", grams: -(b.kg * 1000 * sh.share),
          note: `Venta a granel #${bs.id}: ${b.kg} kg de ${b.item.name} (recibo V-${sale.id})`, userId: session.userId,
        });
      }
    }
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
      lines: [...cartLines.map((l) => ({ name: l.p.name, qty: l.quantity, unit: l.unitGross, total: Math.round(lineGross({ unitGross: l.unitGross, quantity: l.quantity, ivaRate: l.ivaRate }) * factor), byWeight: soldByWeight(l.p.name), kg: false })),
      ...bulkCart.map((b) => ({ name: `${b.item.name} (granel)`, qty: b.kg, unit: Math.round(b.total / b.kg), total: Math.round(b.total * factor), byWeight: false, kg: true }))],
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
    // Granel dentro de la venta: devuelve los kilos al inventario.
    const bulks = await tx.select().from(bulkSales).where(eq(bulkSales.posSaleId, id));
    for (const b of bulks) {
      const moves = await tx
        .select({ rawMaterialId: stockMovements.rawMaterialId, grams: stockMovements.grams })
        .from(stockMovements)
        .where(and(eq(stockMovements.kind, "venta"), like(stockMovements.note, `Venta a granel #${b.id}:%`)));
      for (const m of moves) {
        await applyMovement(tx, { rawMaterialId: m.rawMaterialId, occurredOn: todayISO(), kind: "ajuste", grams: -m.grams, note: `Anulación recibo V-${id}`, userId: null });
      }
      await tx.delete(bulkSales).where(eq(bulkSales.id, b.id));
    }
  });
  revalidatePath("/vender");
  revalidatePath("/caja");
  revalidatePath("/");
}
