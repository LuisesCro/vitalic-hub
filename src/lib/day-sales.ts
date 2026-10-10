import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { posSales, saleLines } from "@/db/schema";
import { vendtyMethodKey, type PaymentKey } from "@/lib/cash";
import { CASH_COLUMN, isPosMethod } from "@/lib/pos";

/** Ventas de un día por medio de pago: lo cobrado en la caja de Vitalic Hub (exacto, también en pagos mixtos) más lo importado de Vendty. */
export async function salesOfDay(date: string) {
  const rows = await db
    .select({ method: saleLines.paymentMethod, total: sql<number>`sum(${saleLines.total})`.mapWith(Number) })
    .from(saleLines)
    .where(sql`(${saleLines.soldAt} at time zone 'America/Bogota')::date = ${date} and not ${saleLines.excluded} and ${saleLines.invoice} not like 'V-%'`)
    .groupBy(saleLines.paymentMethod);
  const byKey: Partial<Record<PaymentKey, number>> = {};
  let mixed = 0;
  for (const r of rows) {
    const key = vendtyMethodKey(r.method);
    if (key) byKey[key] = (byKey[key] ?? 0) + r.total;
    else mixed += r.total;
  }
  let total = rows.reduce((t, r) => t + r.total, 0);
  // Ventas de la caja de Vitalic Hub: traen el valor exacto de cada medio, también en pagos mixtos.
  const hub = await db.select({ payments: posSales.payments, total: posSales.total }).from(posSales).where(sql`${posSales.businessDate} = ${date} and ${posSales.status} = 'vigente'`);
  for (const s of hub) {
    total += s.total;
    for (const p of JSON.parse(s.payments) as { method: string; amount: number }[]) {
      if (!isPosMethod(p.method)) continue;
      const key = CASH_COLUMN[p.method] as PaymentKey;
      byKey[key] = (byKey[key] ?? 0) + p.amount;
    }
  }
  return { byKey, mixed, total };
}

