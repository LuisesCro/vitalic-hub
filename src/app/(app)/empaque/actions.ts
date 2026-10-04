"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { packagingRuns, products } from "@/db/schema";
import { loadComponents } from "@/lib/components";
import { fmtGrams } from "@/lib/catalog";
import { applyMovement } from "@/lib/inventory";
import { requireAdmin } from "@/lib/session";

export type PackState = { ok?: string; error?: string };

export async function recordPackaging(_prev: PackState, formData: FormData): Promise<PackState> {
  const session = await requireAdmin();
  const productId = Number(formData.get("productId"));
  const bags = Number(formData.get("bags"));
  const wasteGrams = Number(String(formData.get("waste") ?? "0").replace(",", ".")) || 0;
  const date = String(formData.get("date") ?? "");
  if (!productId || !(bags > 0) || !date) return { error: "Elige el producto, la cantidad de bolsas y la fecha" };

  const [product] = await db.select().from(products).where(eq(products.id, productId));
  const components = (await loadComponents()).get(productId) ?? [];
  if (!product || components.length === 0) {
    return { error: "Este producto no tiene receta. Complétala en Catálogo." };
  }
  const content = components.reduce((t, c) => t + c.grams, 0);
  const gramsUsed = bags * content + wasteGrams;
  await db.transaction(async (tx) => {
    const [run] = await tx
      .insert(packagingRuns)
      .values({ occurredOn: date, productId, bags, gramsUsed, wasteGrams, createdBy: session.userId })
      .returning({ id: packagingRuns.id });
    // Cada insumo de la receta se descuenta en su proporción; la merma se reparte igual.
    for (const c of components) {
      await applyMovement(tx, {
        rawMaterialId: c.rawMaterialId, occurredOn: date, kind: "empaque",
        grams: -(bags * c.grams + wasteGrams * (c.grams / content)),
        packagingRunId: run.id, note: `${bags} x ${product.name} (${fmtGrams(c.grams)} c/u)`, userId: session.userId,
      });
    }
  });
  revalidatePath("/empaque");
  revalidatePath("/inventario");
  return { ok: `Registrado: ${bags} bolsas de ${product.name} (${(gramsUsed / 1000).toLocaleString("es-CO")} kg descontados).` };
}
