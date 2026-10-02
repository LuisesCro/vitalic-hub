"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin } from "@/lib/session";

export async function updateProduct(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const raw = String(formData.get("rawMaterialId") ?? "");
  const grams = Number(String(formData.get("grams") ?? "").replace(",", "."));
  await db
    .update(products)
    .set({ rawMaterialId: raw ? Number(raw) : null, grams: grams > 0 ? grams : null })
    .where(eq(products.id, id));
  revalidatePath("/productos");
}
