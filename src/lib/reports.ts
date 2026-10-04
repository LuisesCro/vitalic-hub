import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

// Una línea tiene costo válido si el costo es positivo y no supera el doble del precio
// (más que eso es casi siempre un error de carga en Vendty).
const VALID_COST = sql`(unit_cost_net > 0 and (unit_price_net = 0 or unit_cost_net <= unit_price_net * 2))`;

export type MonthRow = {
  month: string; // AAAA-MM
  sales: number;
  salesWithCost: number;
  cost: number;
  tax: number;
  total: number;
  invoices: number;
  grossMargin: number; // sobre líneas con costo
  grossProfit: number; // ventas totales * margen
};

export async function monthlySales(): Promise<MonthRow[]> {
  const rows = await db.execute<{
    month: string; sales: string; sales_with_cost: string; cost: string; tax: string; total: string; invoices: string;
  }>(sql`
    select to_char(date_trunc('month', sold_at at time zone 'America/Bogota'), 'YYYY-MM') as month,
      sum(subtotal_net) as sales,
      sum(case when ${VALID_COST} then subtotal_net else 0 end) as sales_with_cost,
      sum(case when ${VALID_COST} then quantity * unit_cost_net else 0 end) as cost,
      sum(tax) as tax, sum(total) as total, count(distinct invoice) as invoices
    from sale_lines where not excluded
    group by 1 order by 1`);
  return rows.map((r) => {
    const sales = Number(r.sales);
    const swc = Number(r.sales_with_cost);
    const cost = Number(r.cost);
    const grossMargin = swc > 0 ? (swc - cost) / swc : 0;
    return {
      month: r.month, sales, salesWithCost: swc, cost, tax: Number(r.tax), total: Number(r.total),
      invoices: Number(r.invoices), grossMargin, grossProfit: sales * grossMargin,
    };
  });
}

export type ProductRow = {
  sku: string;
  name: string;
  category: string | null;
  units: number;
  sales: number;
  cost: number | null;
  profit: number | null;
  margin: number | null;
  cumShare: number;
  abc: "A" | "B" | "C";
};

/** Ventas y utilidad por producto en los últimos `days` días, con clasificación ABC por ventas. */
export async function productPerformance(days = 365): Promise<ProductRow[]> {
  const rows = await db.execute<{
    sku: string; name: string; category: string | null; units: string; sales: string; sales_with_cost: string; cost: string;
  }>(sql`
    select sku, max(product_name) as name, max(category) as category, sum(quantity) as units,
      sum(subtotal_net) as sales,
      sum(case when ${VALID_COST} then subtotal_net else 0 end) as sales_with_cost,
      sum(case when ${VALID_COST} then quantity * unit_cost_net else 0 end) as cost
    from sale_lines
    where not excluded and sold_at >= now() - make_interval(days => ${days})
    group by sku order by sales desc`);
  const total = rows.reduce((s, r) => s + Number(r.sales), 0) || 1;
  let cum = 0;
  return rows.map((r) => {
    const sales = Number(r.sales);
    const swc = Number(r.sales_with_cost);
    const hasCost = swc >= sales * 0.5 && swc > 0;
    const m = hasCost ? (swc - Number(r.cost)) / swc : null;
    cum += sales;
    const share = cum / total;
    return {
      sku: r.sku, name: r.name, category: r.category, units: Number(r.units), sales,
      cost: hasCost ? sales * (1 - m!) : null, profit: hasCost ? sales * m! : null, margin: m,
      cumShare: share, abc: share <= 0.8 ? "A" : share <= 0.95 ? "B" : "C",
    };
  });
}

export type ConsumptionRow = { rawMaterialId: number; gramsPerDay: number };

/** Consumo diario de cada insumo según las bolsas vendidas en los últimos `days` días. */
export async function rawMaterialConsumption(days = 90): Promise<Map<number, number>> {
  const rows = await db.execute<{ raw_material_id: number; grams: string; span: string }>(sql`
    with comp as (
      -- Receta de cada producto; los que no tienen receta usan su insumo y gramos de siempre.
      select pc.product_id, pc.raw_material_id, pc.grams from product_components pc
      union all
      select p.id, p.raw_material_id, p.grams from products p
      where p.raw_material_id is not null and p.grams is not null
        and not exists (select 1 from product_components x where x.product_id = p.id)
    ), s as (
      select comp.raw_material_id, sl.quantity * comp.grams as grams, sl.sold_at
      from sale_lines sl join products p on p.sku = sl.sku join comp on comp.product_id = p.id
      where not sl.excluded and sl.sold_at >= now() - make_interval(days => ${days})
    )
    select raw_material_id, sum(grams) as grams,
      greatest(1, extract(epoch from (now() - min(sold_at))) / 86400) as span
    from s group by raw_material_id`);
  return new Map(rows.map((r) => [Number(r.raw_material_id), Number(r.grams) / Math.min(days, Number(r.span))]));
}

export async function expensesByMonth(): Promise<Map<string, { total: number; byCategory: Record<string, number> }>> {
  const rows = await db.execute<{ month: string; category: string; amount: string }>(sql`
    select to_char(month, 'YYYY-MM') as month, category, sum(amount) as amount
    from expenses group by 1, 2 order by 1`);
  const out = new Map<string, { total: number; byCategory: Record<string, number> }>();
  for (const r of rows) {
    const entry = out.get(r.month) ?? { total: 0, byCategory: {} };
    entry.total += Number(r.amount);
    entry.byCategory[r.category] = (entry.byCategory[r.category] ?? 0) + Number(r.amount);
    out.set(r.month, entry);
  }
  return out;
}

/** Insumos que ya tienen movimientos (conteo, compra o empaque). Los demás aún no tienen existencia confiable. */
export async function trackedRawMaterialIds(): Promise<Set<number>> {
  const rows = await db.execute<{ id: number }>(sql`select distinct raw_material_id as id from stock_movements`);
  return new Set(rows.map((r) => Number(r.id)));
}
