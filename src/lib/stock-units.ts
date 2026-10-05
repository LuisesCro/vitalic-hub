import "server-only";
import { sql } from "drizzle-orm";
import type { db } from "@/db";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Suma o resta bolsas de un producto, solo si ese producto lleva conteo (stock_units no es nulo). */
export async function adjustStockUnits(tx: Tx, productId: number, delta: number) {
  if (!delta) return;
  await tx.execute(sql`update products set stock_units = stock_units + ${delta} where id = ${productId} and stock_units is not null`);
}

export async function adjustStockUnitsBySku(tx: Tx, sku: string, delta: number) {
  if (!delta) return;
  await tx.execute(sql`update products set stock_units = stock_units + ${delta} where sku = ${sku} and stock_units is not null`);
}
