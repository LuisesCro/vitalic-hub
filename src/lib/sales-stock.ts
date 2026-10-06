import "server-only";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db";
import { stockMovements } from "@/db/schema";
import { applyMovement } from "@/lib/inventory";
import { todayISO } from "@/lib/format";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StockDeduction = { date: string; rawMaterialId: number; name: string; grams: number };

/**
 * Descuenta del inventario de insumos lo vendido en un rango de días (ventas importadas de Vendty,
 * cierres de caja…): cada bolsa gasta los gramos de su receta, y lo vendido por peso gasta los gramos vendidos.
 * Cada día e insumo se descuenta una sola vez, aunque se repita el proceso.
 */
export async function deductImportedSales(opts: { from: string; to: string; userId: number }): Promise<{ applied: StockDeduction[]; skipped: number }> {
  const rows = await db.execute<{ d: string; raw_material_id: number; name: string; grams: string }>(sql`
    with comp as (
      select pc.product_id, pc.raw_material_id, pc.grams from product_components pc
      union all
      select p.id, p.raw_material_id, p.grams from products p
      where p.raw_material_id is not null and p.grams is not null
        and not exists (select 1 from product_components x where x.product_id = p.id)
    )
    select to_char((sl.sold_at at time zone 'America/Bogota')::date, 'YYYY-MM-DD') as d, comp.raw_material_id, rm.name,
           sum(sl.quantity * comp.grams) as grams
    from sale_lines sl
    join products p on p.sku = sl.sku
    join comp on comp.product_id = p.id
    join raw_materials rm on rm.id = comp.raw_material_id
    where not sl.excluded and sl.invoice not like 'V-%' and sl.quantity > 0
      and (sl.sold_at at time zone 'America/Bogota')::date between ${opts.from}::date and ${opts.to}::date
    group by 1, 2, 3 order by 1, 4 desc`);

  const applied: StockDeduction[] = [];
  let skipped = 0;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const grams = Number(r.grams);
      if (!(grams > 0)) continue;
      const note = `Ventas del ${r.d} (descuento por receta)`;
      const [done] = await tx.select({ id: stockMovements.id }).from(stockMovements).where(and(eq(stockMovements.rawMaterialId, r.raw_material_id), eq(stockMovements.note, note))).limit(1);
      if (done) { skipped++; continue; }
      await applyMovement(tx, { rawMaterialId: r.raw_material_id, occurredOn: r.d, kind: "venta", grams: -grams, note, userId: opts.userId });
      applied.push({ date: r.d, rawMaterialId: r.raw_material_id, name: r.name, grams });
    }
  });
  return { applied, skipped };
}

/** Descuento de una venta de la caja de Hub: un movimiento por insumo, con el número de recibo en la nota. */
export async function deductPosSale(tx: Tx, opts: { saleId: number; lines: { components: { rawMaterialId: number; grams: number }[]; quantity: number }[]; userId: number | null }) {
  const byMaterial = new Map<number, number>();
  for (const l of opts.lines) for (const c of l.components) byMaterial.set(c.rawMaterialId, (byMaterial.get(c.rawMaterialId) ?? 0) + c.grams * l.quantity);
  for (const [rawMaterialId, grams] of byMaterial) {
    if (grams > 0) await applyMovement(tx, { rawMaterialId, occurredOn: todayISO(), kind: "venta", grams: -grams, note: `Recibo V-${opts.saleId} (descuento por receta)`, userId: opts.userId });
  }
}

/** Devuelve al inventario lo descontado por un recibo (anulación) o por una parte de él (devolución). */
export async function restorePosSale(tx: Tx, opts: { saleId: number; label: string; lines?: { components: { rawMaterialId: number; grams: number }[]; quantity: number }[]; userId: number | null }) {
  if (opts.lines) {
    const byMaterial = new Map<number, number>();
    for (const l of opts.lines) for (const c of l.components) byMaterial.set(c.rawMaterialId, (byMaterial.get(c.rawMaterialId) ?? 0) + c.grams * l.quantity);
    for (const [rawMaterialId, grams] of byMaterial) if (grams > 0) await applyMovement(tx, { rawMaterialId, occurredOn: todayISO(), kind: "ajuste", grams, note: opts.label, userId: opts.userId });
    return;
  }
  const moves = await tx
    .select({ rawMaterialId: stockMovements.rawMaterialId, grams: stockMovements.grams })
    .from(stockMovements)
    .where(and(eq(stockMovements.kind, "venta"), like(stockMovements.note, `Recibo V-${opts.saleId} (descuento por receta)`)));
  for (const m of moves) await applyMovement(tx, { rawMaterialId: m.rawMaterialId, occurredOn: todayISO(), kind: "ajuste", grams: -m.grams, note: opts.label, userId: opts.userId });
}
