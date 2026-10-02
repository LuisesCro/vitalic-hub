"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { packagingRuns, products } from "@/db/schema";
import { applyMovement } from "@/lib/inventory";
import { requireSession } from "@/lib/session";

export type PackState = { ok?: string; error?: string };

export async function recordPackaging(_prev: PackState, formData: FormData): Promise<PackState> {
  const session = await requireSession();
  const productId = Number(formData.get("productId"));
  const bags = Number(formData.get("bags"));
  const wasteGrams = Number(String(formData.get("waste") ?? "0").replace(",", ".")) || 0;
  const date = String(formData.get("date") ?? "");
  if (!productId || !(bags > 0) || !date) return { error: "Elige el producto, la cantidad de bolsas y la fecha" };

  const [product] = await db.select().from(products).where(eq(products.id, productId));
  if (!product?.rawMaterialId || !product.grams) {
    return { error: "Este producto no tiene insumo o gramos asignados. Corrígelo en Productos." };
  }
  const gramsUsed = bags * product.grams + wasteGrams;
  await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(packagingRuns)
      .values({ occurredOn: date, productId, bags, gramsUsed, wasteGrams, createdBy: session.userId })
      .returning({ id: packagingRuns.id });
    await applyMovement(tx, {
      rawMaterialId: product.rawMaterialId!, occurredOn: date, kind: "empaque", grams: -gramsUsed,
      packagingRunId: run.id, note: `${bags} x ${product.name}`, userId: session.userId,
    });
  });
  revalidatePath("/empaque");
  revalidatePath("/inventario");
  return { ok: `Registrado: ${bags} bolsas de ${product.name} (${(gramsUsed / 1000).toLocaleString("es-CO")} kg descontados).` };
}
