import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rawMaterials, stockMovements } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type MovementInput = {
  rawMaterialId: number;
  occurredOn: string;
  kind: "entrada" | "empaque" | "ajuste" | "venta";
  grams: number; // positivo entra, negativo sale
  costPerKg?: number | null;
  purchaseLineId?: number | null;
  packagingRunId?: number | null;
  note?: string | null;
  userId?: number | null;
};

/**
 * Registra un movimiento y actualiza la existencia. En las entradas recalcula el
 * costo promedio ponderado por kilo con lo que había y lo que llega.
 */
export async function applyMovement(tx: Tx, m: MovementInput) {
  const [current] = await tx
    .select({ stock: rawMaterials.stockGrams, avg: rawMaterials.avgCostPerKg })
    .from(rawMaterials)
    .where(eq(rawMaterials.id, m.rawMaterialId))
    .for("update");
  if (!current) throw new Error(`Insumo ${m.rawMaterialId} no existe`);

  let newAvg = current.avg;
  if (m.kind === "entrada" && m.grams > 0 && m.costPerKg && m.costPerKg > 0) {
    const stockKg = Math.max(current.stock, 0) / 1000;
    const inKg = m.grams / 1000;
    newAvg = stockKg > 0 ? (stockKg * current.avg + inKg * m.costPerKg) / (stockKg + inKg) : m.costPerKg;
  }

  await tx
    .update(rawMaterials)
    .set({ stockGrams: sql`${rawMaterials.stockGrams} + ${m.grams}`, avgCostPerKg: newAvg })
    .where(eq(rawMaterials.id, m.rawMaterialId));

  await tx.insert(stockMovements).values({
    rawMaterialId: m.rawMaterialId,
    occurredOn: m.occurredOn,
    kind: m.kind,
    grams: m.grams,
    costPerKg: m.costPerKg ?? null,
    purchaseLineId: m.purchaseLineId ?? null,
    packagingRunId: m.packagingRunId ?? null,
    note: m.note ?? null,
    createdBy: m.userId ?? null,
  });
}
