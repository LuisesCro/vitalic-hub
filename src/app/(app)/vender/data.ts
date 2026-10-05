import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { posSales, products, saleLines, users } from "@/db/schema";
import type { TicketData } from "@/components/ticket";
import { fmtCOP } from "@/lib/format";
import { POS_METHODS, soldByWeight, type PosMethod } from "@/lib/pos";
import { productPerformance } from "@/lib/reports";

export type PosProduct = { id: number; sku: string; name: string; category: string | null; priceGross: number; ivaRate: number; byWeight: boolean };

/** Productos activos con precio, listos para vender. El costo nunca viaja al navegador. */
export async function posProducts(): Promise<{ all: PosProduct[]; quick: number[] }> {
  const rows = await db.select().from(products).where(eq(products.active, true)).orderBy(asc(products.name));
  const all = rows
    .filter((p) => p.priceNet > 0)
    .map((p) => ({
      id: p.id, sku: p.sku, name: p.name, category: p.category,
      priceGross: Math.round(p.priceNet * (1 + p.ivaRate) * 100) / 100, ivaRate: p.ivaRate, byWeight: soldByWeight(p.name),
    }));
  const perf = await productPerformance(90);
  const bySku = new Map(all.map((p) => [p.sku, p.id]));
  const quick = perf.map((r) => bySku.get(r.sku)).filter((id): id is number => !!id).slice(0, 24);
  return { all, quick };
}

export type TodaySale = { id: number; number: string; time: string; total: number; status: string; payments: { method: PosMethod; amount: number }[]; seller: string | null; ticket: TicketData };

export function receiptTicket(opts: {
  id: number; soldAt: Date; seller: string | null; customer: string | null; lines: { name: string; qty: number; unit: number; total: number; byWeight: boolean }[];
  gross: number; discount: number; total: number; payments: { method: PosMethod; amount: number }[]; cashReceived: number | null; change: number | null; voided?: boolean;
}): TicketData {
  const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 3 });
  return {
    title: opts.voided ? "VENTA ANULADA" : "RECIBO DE VENTA",
    number: `V-${opts.id}`,
    date: opts.soldAt.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }),
    rows: [...(opts.seller ? [{ label: "Atendió", value: opts.seller }] : []), ...(opts.customer ? [{ label: "Cliente", value: opts.customer }] : [])],
    items: opts.lines.map((l) => ({ name: l.name, detail: `${fmt(l.qty)}${l.byWeight ? " g" : ""} × ${fmtCOP(l.unit)}`, total: l.total })),
    totals: [
      ...(opts.discount > 0 ? [{ label: "Subtotal", value: fmtCOP(opts.gross) }, { label: "Descuento", value: `-${fmtCOP(opts.discount)}` }] : []),
      { label: "TOTAL", value: fmtCOP(opts.total), big: true },
      ...opts.payments.map((p) => ({ label: POS_METHODS[p.method] ?? p.method, value: fmtCOP(p.amount) })),
      ...(opts.cashReceived && opts.change ? [{ label: "Recibido", value: fmtCOP(opts.cashReceived) }, { label: "Cambio", value: fmtCOP(opts.change) }] : []),
    ],
    footer: "¡Gracias por tu compra! Vuelve pronto.",
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
    .limit(25);
  if (sales.length === 0) return [];
  const lines = await db.select().from(saleLines).where(inArray(saleLines.invoice, sales.map((x) => `V-${x.s.id}`)));
  return sales.map(({ s, seller }) => {
    const mine = lines.filter((l) => l.invoice === `V-${s.id}`);
    const payments = JSON.parse(s.payments) as { method: PosMethod; amount: number }[];
    const gross = mine.reduce((t, l) => t + Math.round(l.unitPriceNet * l.quantity * (l.tax / (l.subtotalNet || 1) + 1)), 0);
    return {
      id: s.id, number: `V-${s.id}`, status: s.status, total: s.total, payments, seller,
      time: s.soldAt.toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }),
      ticket: receiptTicket({
        id: s.id, soldAt: s.soldAt, seller, customer: s.customer, gross: Math.max(gross, s.total), discount: Math.max(0, gross - s.total), total: s.total,
        lines: mine.map((l) => ({ name: l.productName, qty: l.quantity, unit: Math.round(l.total / (l.quantity || 1)), total: l.total, byWeight: soldByWeight(l.productName) })),
        payments, cashReceived: s.cashReceived, change: s.changeGiven, voided: s.status === "anulada",
      }),
    };
  });
}
