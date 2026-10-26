"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { productComponents, products } from "@/db/schema";
import { requireAdmin } from "@/lib/session";

/** Corrige los gramos de una presentación; si su receta lleva un solo insumo, también los gramos de la receta. */
export async function fixGrams(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const grams = Number(String(formData.get("grams") ?? "").replace(",", "."));
  if (!id || !(grams > 0)) return;
  await db.transaction(async (tx) => {
    await tx.update(products).set({ grams }).where(eq(products.id, id));
    const comps = await tx.select().from(productComponents).where(eq(productComponents.productId, id));
    if (comps.length === 1) await tx.update(productComponents).set({ grams }).where(eq(productComponents.id, comps[0].id));
  });
  revalidatePath("/catalogo", "layout");
  revalidatePath("/vender");
}
