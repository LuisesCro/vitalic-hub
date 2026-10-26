import { gramsFromName } from "./units";

/** Gramos que dice el código del producto: «VTL-ACE-AJI-500G» → 500, «…-1KG» → 1000, «…-10G-P10» (paquete de 10) → 100. */
export function gramsFromSku(sku: string): number | null {
  const m = sku.toLowerCase().match(/(?:^|[-\s_])(\d+(?:[.,]\d+)?)\s*(kg|gr?|grs)(?=$|[-\s_x])/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  const pack = sku.toLowerCase().match(/-p(\d+)$/);
  return (m[2] === "kg" ? n * 1000 : n) * (pack ? Number(pack[1]) : 1);
}

export type GramsIssue = { id: number; name: string; sku: string; grams: number | null; reasons: string[]; suggested: number | null };

const differs = (a: number, b: number) => Math.abs(a - b) > Math.max(1, b * 0.02);

/**
 * Busca presentaciones con los gramos mal cargados comparando lo guardado con lo que dicen el nombre, el código y la receta.
 * Cuando dos de esas fuentes coinciden entre sí y no con lo guardado, sugiere ese valor.
 */
export function auditGrams(p: { id: number; name: string; sku: string; format: string; grams: number | null; recipeGrams: number | null }): GramsIssue | null {
  if (p.format === "sachet") {
    return p.recipeGrams !== null && p.grams !== null && differs(p.recipeGrams, p.grams)
      ? { id: p.id, name: p.name, sku: p.sku, grams: p.grams, reasons: [`la receta suma ${p.recipeGrams} g`], suggested: null }
      : null;
  }
  const nameG = gramsFromName(p.name);
  const skuG = gramsFromSku(p.sku);
  const reasons: string[] = [];
  const stored = p.grams && p.grams > 0 ? p.grams : null;
  if (p.format === "bolsa" && (stored === null || stored <= 1)) reasons.push("sin gramos o con 1 g");
  if (stored !== null && nameG !== null && differs(stored, nameG)) reasons.push(`el nombre dice ${nameG} g`);
  // El nombre pesa más que el código: si el nombre coincide con lo guardado, un código mal escrito no es un error de gramos.
  const nameAgrees = stored !== null && nameG !== null && !differs(stored, nameG);
  if (stored !== null && skuG !== null && differs(stored, skuG) && !nameAgrees) reasons.push(`el código dice ${skuG} g`);
  if (stored !== null && p.recipeGrams !== null && differs(p.recipeGrams, stored)) reasons.push(`la receta suma ${Math.round(p.recipeGrams * 10) / 10} g`);
  if (!reasons.length) return null;
  const candidates = [nameG, skuG, p.recipeGrams].filter((v): v is number => v !== null && v > 1);
  let suggested: number | null = null;
  for (const c of candidates) if (candidates.filter((o) => !differs(o, c)).length >= 2 && (stored === null || differs(stored, c))) { suggested = c; break; }
  if (suggested === null && candidates.length === 1 && (stored === null || stored <= 1)) suggested = candidates[0];
  return { id: p.id, name: p.name, sku: p.sku, grams: stored, reasons, suggested };
}
