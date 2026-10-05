import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { posSales, products, saleLines, users } from "@/db/schema";
import type { TicketData } from "@/components/ticket";
import { fmtCOP } from "@/lib/format";
import { POS_METHODS, soldByWeight, type PosMethod } from "@/lib/pos";
import { productPerformance } from "@/lib/reports";

export type PosProduct = { id: number; sku: string; name: string; category: string | null; priceGross: number; ivaRate: number; byWeight: boolean; stock: number | null };

/** Productos activos con precio, listos para vender. El costo nunca viaja al navegador. */
export async function posProducts(): Promise<{ all: PosProduct[]; quick: number[] }> {
  const rows = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
  const all = rows
    .filter((p) => p.priceNet > 0)
    .map((p) => ({
      id: p.id, sku: p.sku, name: p.name, category: p.category,
      priceGross: Math.round(p.priceNet * (1 + p.ivaRate) * 100) / 100, ivaRate: p.ivaRate, byWeight: soldByWeight(p.name),
      stock: p.stockUnits === null || soldByWeight(p.name) ? null : p.stockUnits,
    }));
  const perf = await productPerformance(90);
  const bySku = new Map(all.map((p) => [p.sku, p.id]));
  const quick = perf.map((r) => bySku.get(r.sku)).filter((id): id is number => !!id).slice(0, 24);
  return { all, quick };
}

export type SaleLineInfo = { id: number; name: string; quantity: number; returned: number; unit: number; kg: boolean; byWeight: boolean };
export type TodaySale = {
  id: number; number: string; time: string; total: number; status: string; payments: { method: PosMethod; amount: number }[]; seller: string | null; ticket: TicketData;
  returnOf: number | null; hasReturns: boolean; lines: SaleLineInfo[];
};

export function receiptTicket(opts: {
  id: number; soldAt: Date; seller: string | null; customer: string | null; returnOf?: number | null; lines: { name: string; qty: number; unit: number; total: number; byWeight: boolean; kg?: boolean }[];
  gross: number; discount: number; total: number; payments: { method: PosMethod; amount: number }[]; cashReceived: number | null; change: number | null; voided?: boolean;
}): TicketData {
  const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 3 });
  return {
    title: opts.voided ? "VENTA ANULADA" : opts.returnOf ? "DEVOLUCIÓN" : "RECIBO DE VENTA",
    number: `V-${opts.id}`,
    date: opts.soldAt.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }),
    rows: [...(opts.returnOf ? [{ label: "Devuelve de", value: `V-${opts.returnOf}` }] : []), ...(opts.seller ? [{ label: "Atendió", value: opts.seller }] : []), ...(opts.customer ? [{ label: "Cliente", value: opts.customer }] : [])],
    items: opts.lines.map((l) => ({ name: l.name, detail: `${fmt(l.qty)}${l.byWeight ? " g" : l.kg ? " kg" : ""} × ${fmtCOP(l.unit)}${l.kg ? "/kg" : ""}`, total: l.total })),
    totals: [
      ...(opts.discount > 0 ? [{ label: "Subtotal", value: fmtCOP(opts.gross) }, { label: "Descuento", value: `-${fmtCOP(opts.discount)}` }] : []),
      { label: "TOTAL", value: fmtCOP(opts.total), big: true },
      ...opts.payments.map((p) => ({ label: opts.returnOf ? `Devuelto en ${(POS_METHODS[p.method] ?? p.method).toLowerCase()}` : POS_METHODS[p.method] ?? p.method, value: fmtCOP(Math.abs(p.amount)) })),
      ...(opts.cashReceived && opts.change ? [{ label: "Recibido", value: fmtCOP(opts.cashReceived) }, { label: "Cambio", value: fmtCOP(opts.change) }] : []),
    ],
    footer: opts.returnOf ? "Conserva este comprobante." : "¡Gracias por tu compra! Vuelve pronto.",
  };
}

/** Ventas de hoy (más recientes primero) con su recibo listo para reimprimir. */
export async function todaySales(date: string): Promise<TodaySale[]> {
  const sales = await db
    .select({ s: posSales, seller: users.name })
    .from(posSales)
    .leftJoin(users, eq(posSales.createdBy, users.id))
    .where(eq(posSales.businessDate, date))
    .orderBy(desc(posSales.id))
    .limit(40);
  if (sales.length === 0) return [];
  const lines = await db.select().from(saleLines).where(inArray(saleLines.invoice, sales.map((x) => `V-${x.s.id}`)));
  // Devoluciones de hoy y de días anteriores sobre estas ventas (para saber cuánto queda por devolver).
  const saleIds = sales.map((x) => x.s.id);
  const retRows = await db.select({ id: posSales.id, of: posSales.returnOf }).from(posSales).where(and(inArray(posSales.returnOf, saleIds), eq(posSales.status, "vigente")));
  const retLines = retRows.length ? await db.select().from(saleLines).where(inArray(saleLines.invoice, retRows.map((r) => `V-${r.id}`))) : [];
  const returnedByKey = new Map<string, number>();
  for (const r of retLines) {
    const orig = r.externalKey.split("|").slice(1).join("|");
    returnedByKey.set(orig, (returnedByKey.get(orig) ?? 0) - r.quantity);
  }
  return sales.map(({ s, seller }) => {
    const mine = lines.filter((l) => l.invoice === `V-${s.id}`);
    const payments = JSON.parse(s.payments) as { method: PosMethod; amount: number }[];
    const gross = mine.reduce((t, l) => t + Math.round(l.unitPriceNet * l.quantity * (l.tax / (l.subtotalNet || 1) + 1)), 0);
    return {
      id: s.id, number: `V-${s.id}`, status: s.status, total: s.total, payments, seller, returnOf: s.returnOf,
      hasReturns: retRows.some((r) => r.of === s.id),
      lines: s.returnOf ? [] : mine.map((l) => ({
        id: l.id, name: l.productName, quantity: l.quantity, returned: returnedByKey.get(l.externalKey) ?? 0, unit: Math.round(l.total / (l.quantity || 1)),
        kg: l.sku.startsWith("GRANEL-"), byWeight: soldByWeight(l.productName),
      })),
      time: s.soldAt.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }),
      ticket: receiptTicket({
        id: s.id, soldAt: s.soldAt, seller, customer: s.customer, returnOf: s.returnOf, gross: Math.max(gross, s.total), discount: Math.max(0, gross - s.total), total: s.total,
        lines: mine.map((l) => ({ name: l.productName, qty: l.quantity, unit: Math.round(l.total / (l.quantity || 1)), total: l.total, byWeight: soldByWeight(l.productName), kg: l.sku.startsWith("GRANEL-") })),
        payments, cashReceived: s.cashReceived, change: s.changeGiven, voided: s.status === "anulada",
      }),
    };
  });
}
