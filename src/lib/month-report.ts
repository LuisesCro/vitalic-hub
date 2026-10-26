import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { PAYMENT_METHODS, expectedCash } from "@/lib/cash";
import { stockAlerts } from "@/lib/stock-alerts";

const VALID_COST = sql`(unit_cost_net > 0 and (unit_price_net = 0 or unit_cost_net <= unit_price_net * 2))`;
const num = (v: unknown) => Number(v ?? 0);

export type DayRow = { day: string; sales: number; total: number; tickets: number; profit: number; margin: number | null };
export type ProductRow = { name: string; units: number; sales: number; profit: number | null; margin: number | null };
export type MonthReport = {
  from: string; to: string;
  totals: { net: number; tax: number; gross: number; cost: number; profit: number; margin: number; tickets: number; salesWithCostShare: number };
  days: DayRow[];
  byMethod: { label: string; value: number }[];
  cash: { day: string; sales: number; expected: number; counted: number | null; diff: number | null; status: string }[];
  topSales: ProductRow[];
  topProfit: ProductRow[];
  lowMargin: ProductRow[];
  expenses: { category: string; amount: number }[];
  expensesTotal: number;
  payables: { supplier: string; invoice: string; issued: string | null; due: string | null; total: number; balance: number; daysOverdue: number }[];
  inventoryValue: number;
  alertsOut: number;
  alertsLow: number;
};

/** Informe del mes hasta una fecha (inclusive): ventas, utilidad, caja, productos, gastos, deudas e inventario. */
export async function monthReport(from: string, to: string): Promise<MonthReport> {
  const where = sql`not excluded and (sold_at at time zone 'America/Bogota')::date between ${from}::date and ${to}::date`;

  const [t] = await db.execute<{ net: string; tax: string; gross: string; swc: string; cost: string; tickets: string }>(sql`
    select coalesce(sum(subtotal_net),0) net, coalesce(sum(tax),0) tax, coalesce(sum(total),0) gross,
      coalesce(sum(case when ${VALID_COST} then subtotal_net else 0 end),0) swc,
      coalesce(sum(case when ${VALID_COST} then quantity*unit_cost_net else 0 end),0) cost,
      count(distinct invoice) tickets
    from sale_lines where ${where}`);
  const net = num(t.net), swc = num(t.swc), costWith = num(t.cost);
  const margin = swc > 0 ? (swc - costWith) / swc : 0;

  const dayRows = await db.execute<{ d: string; net: string; gross: string; tickets: string; swc: string; cost: string }>(sql`
    select to_char((sold_at at time zone 'America/Bogota')::date,'YYYY-MM-DD') d, sum(subtotal_net) net, sum(total) gross, count(distinct invoice) tickets,
      sum(case when ${VALID_COST} then subtotal_net else 0 end) swc, sum(case when ${VALID_COST} then quantity*unit_cost_net else 0 end) cost
    from sale_lines where ${where} group by 1 order by 1`);
  const days: DayRow[] = dayRows.map((r) => {
    const m = num(r.swc) > 0 ? (num(r.swc) - num(r.cost)) / num(r.swc) : null;
    return { day: r.d, sales: num(r.net), total: num(r.gross), tickets: num(r.tickets), profit: m === null ? 0 : num(r.net) * m, margin: m };
  });

  // Medios de pago y cuadre: de las cajas del mes.
  const sessions = await db.execute<{ id: number; d: string; opening: string; sc: string; sca: string; sn: string; sd: string; sb: string; st: string; so: string; counted: string | null; status: string }>(sql`
    select id, business_date::text d, opening_cash opening, sales_cash sc, sales_card sca, sales_nequi sn, sales_daviplata sd, sales_breb sb, sales_transfer st, sales_other so, counted_cash counted, status
    from cash_sessions where business_date between ${from}::date and ${to}::date order by business_date`);
  const moves = await db.execute<{ session_id: number; kind: string; amount: string }>(sql`
    select m.session_id, m.kind, m.amount from cash_movements m join cash_sessions s on s.id = m.session_id where s.business_date between ${from}::date and ${to}::date`);
  const methodTotals = [0, 0, 0, 0, 0, 0, 0];
  const cash = sessions.map((s) => {
    const vals = [num(s.sc), num(s.sca), num(s.sn), num(s.sd), num(s.sb), num(s.st), num(s.so)];
    vals.forEach((v, i) => (methodTotals[i] += v));
    const mv = moves.filter((m) => m.session_id === s.id).map((m) => ({ kind: m.kind, amount: num(m.amount) }));
    const expected = expectedCash(num(s.opening), num(s.sc), mv);
    const counted = s.counted === null ? null : num(s.counted);
    const diff = counted === null ? null : counted - expected;
    return { day: s.d, sales: vals.reduce((a, b) => a + b, 0), expected, counted, diff, status: s.status };
  });
  const byMethod = PAYMENT_METHODS.map((m, i) => ({ label: m.label, value: methodTotals[i] })).filter((m) => m.value > 0);

  const prodRows = await db.execute<{ name: string; units: string; net: string; swc: string; cost: string }>(sql`
    select max(product_name) name, sum(quantity) units, sum(subtotal_net) net,
      sum(case when ${VALID_COST} then subtotal_net else 0 end) swc, sum(case when ${VALID_COST} then quantity*unit_cost_net else 0 end) cost
    from sale_lines where ${where} group by sku, lower(product_name)`);
  const products: ProductRow[] = prodRows.map((r) => {
    const s = num(r.net), w = num(r.swc), c = num(r.cost);
    const full = w > 0 && w >= s * 0.95;
    return { name: r.name, units: num(r.units), sales: s, profit: full ? s - c : null, margin: full ? (s - c) / s : null };
  });
  const topSales = [...products].sort((a, b) => b.sales - a.sales).slice(0, 15);
  const topProfit = products.filter((p) => p.profit !== null).sort((a, b) => (b.profit ?? 0) - (a.profit ?? 0)).slice(0, 12);
  const lowMargin = [...products].sort((a, b) => b.sales - a.sales).slice(0, 60).filter((p) => p.margin !== null && p.margin < 0.25).sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0)).slice(0, 12);

  const monthStart = `${to.slice(0, 7)}-01`;
  const exp = await db.execute<{ category: string; amount: string }>(sql`select category, sum(amount) amount from expenses where month = ${monthStart}::date group by category order by 2 desc`);
  const expenses = exp.map((e) => ({ category: e.category, amount: num(e.amount) }));

  const pay = await db.execute<{ supplier: string | null; invoice: string | null; issued: string | null; due: string | null; total: string; paid: string }>(sql`
    select s.name supplier, p.invoice_number invoice, p.issue_date::text issued, p.due_date::text due, p.total, coalesce(pg.paid,0) paid
    from purchases p left join suppliers s on s.id = p.supplier_id
    left join (select purchase_id, sum(amount) paid from supplier_payments group by purchase_id) pg on pg.purchase_id = p.id
    order by p.due_date nulls last`);
  const payables = pay
    .map((r) => ({ supplier: r.supplier ?? "Sin proveedor", invoice: r.invoice ?? "—", issued: r.issued, due: r.due, total: num(r.total), balance: num(r.total) - num(r.paid), daysOverdue: r.due && r.due < to ? Math.round((Date.parse(to) - Date.parse(r.due)) / 864e5) : 0 }))
    .filter((r) => r.balance >= 100);

  const [inv] = await db.execute<{ v: string }>(sql`select coalesce(sum(greatest(stock_grams,0)/1000.0*avg_cost_per_kg),0) v from raw_materials where active`);
  const alerts = await stockAlerts({ insumos: true });

  return {
    from, to,
    totals: { net, tax: num(t.tax), gross: num(t.gross), cost: costWith, profit: net * margin, margin, tickets: num(t.tickets), salesWithCostShare: net > 0 ? swc / net : 1 },
    days, byMethod, cash, topSales, topProfit, lowMargin, expenses, expensesTotal: expenses.reduce((a, e) => a + e.amount, 0), payables,
    inventoryValue: num(inv.v), alertsOut: alerts.filter((a) => a.level === "agotado").length, alertsLow: alerts.filter((a) => a.level === "bajo").length,
  };
}
