"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { products, rawMaterials } from "@/db/schema";
import { applyMovement } from "@/lib/inventory";
import { requireAdmin } from "@/lib/session";
import { todayISO } from "@/lib/format";

function kgField(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? "").replace(",", ".").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Conteo físico: deja la existencia en lo contado y registra la diferencia como ajuste. */
export async function recordCount(formData: FormData) {
  const session = await requireAdmin();
  const id = Number(formData.get("id"));
  const countedKg = kgField(formData, "counted");
  const minKg = kgField(formData, "min");
  await db.transaction(async (tx) => {
    const [m] = await tx.select().from(rawMaterials).where(eq(rawMaterials.id, id));
    if (!m) return;
    if (countedKg !== null) {
      const diff = countedKg * 1000 - m.stockGrams;
      if (Math.abs(diff) >= 1) {
        await applyMovement(tx, {
          rawMaterialId: id, occurredOn: todayISO(), kind: "ajuste", grams: diff,
          note: "Conteo físico", userId: session.userId,
        });
      }
    }
    if (minKg !== null) await tx.update(rawMaterials).set({ minStockGrams: minKg * 1000 }).where(eq(rawMaterials.id, id));
  });
  revalidatePath("/inventario");
}

/** Conteo de bolsas listas para vender de un producto: deja el stock en lo contado (0 si ya no hay). */
export async function setBagStock(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const units = kgField(formData, "units");
  if (!id || units === null || units < 0) return;
  await db.update(products).set({ stockUnits: units }).where(eq(products.id, id));
  revalidatePath("/inventario");
  revalidatePath("/vender");
  revalidatePath("/");
}
