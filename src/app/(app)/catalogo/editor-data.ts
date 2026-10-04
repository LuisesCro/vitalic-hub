import "server-only";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { productFamilies, rawMaterials } from "@/db/schema";
import type { Material } from "./family-editor";

/** Insumos y categorías que el editor necesita para sugerir mientras se escribe. */
export async function editorOptions(): Promise<{ materials: Material[]; categories: string[] }> {
  const materials = await db
    .select({ id: rawMaterials.id, name: rawMaterials.name, costPerKg: rawMaterials.avgCostPerKg, stockGrams: rawMaterials.stockGrams })
    .from(rawMaterials)
    .orderBy(asc(rawMaterials.name));
  const families = await db.select({ category: productFamilies.category }).from(productFamilies);
  const categories = [...new Set(families.map((f) => f.category).filter((c): c is string => !!c))].sort();
  return { materials, categories };
}
