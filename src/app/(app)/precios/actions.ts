"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { competitorPrices, competitors, products } from "@/db/schema";
import { parseCompetitorFile } from "@/lib/competitors";
import { matchProduct } from "@/lib/matching";
import { requireAdmin } from "@/lib/session";
import { todayISO } from "@/lib/format";

export type CompetitorState = { ok?: string; error?: string };

export async function uploadCompetitorCatalog(_prev: CompetitorState, formData: FormData): Promise<CompetitorState> {
  await requireAdmin();
  const name = String(formData.get("competitor") ?? "").trim();
  const file = formData.get("file");
  if (!name) return { error: "Escribe el nombre del competidor" };
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona el catálogo (Excel o CSV)" };

  let rows;
  try {
    rows = parseCompetitorFile(new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No pude leer el catálogo" };
  }
  if (rows.length === 0) return { error: "El catálogo no trae filas con precio" };

  const [competitor] = await db
    .insert(competitors)
    .values({ name })
    .onConflictDoUpdate({ target: competitors.name, set: { name } })
    .returning({ id: competitors.id });
  const own = await db.select({ id: products.id, name: products.name, grams: products.grams }).from(products);
  const capturedOn = todayISO();
  let matched = 0;
  const values = rows.map((r) => {
    const product = matchProduct(r.name, r.grams, own);
    if (product) matched++;
    return { competitorId: competitor.id, productId: product?.id ?? null, rawName: r.name, grams: r.grams, priceGross: r.priceGross, capturedOn };
  });
  for (let i = 0; i < values.length; i += 500) await db.insert(competitorPrices).values(values.slice(i, i + 500));
  revalidatePath("/precios");
  return { ok: `${name}: ${rows.length} precios cargados, ${matched} emparejados con productos de Vitalic.` };
}

/** Cambia el precio al público (con IVA) de un producto: guarda el precio sin IVA según el IVA del producto. */
export async function setProductPrice(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const gross = Number(String(formData.get("price") ?? "").replace(/[^0-9]/g, ""));
  if (!id || !(gross > 0)) return;
  const [p] = await db.select({ iva: products.ivaRate }).from(products).where(eq(products.id, id));
  if (!p) return;
  await db.update(products).set({ priceNet: Math.round((gross / (1 + p.iva)) * 100) / 100 }).where(eq(products.id, id));
  revalidatePath("/precios");
  revalidatePath("/vender");
  revalidatePath("/catalogo", "layout");
  revalidatePath("/", "layout");
}
