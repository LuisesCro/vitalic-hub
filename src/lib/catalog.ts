import { normalize } from "./units";

/** Reglas del catálogo: familias, presentaciones y recetas. Sin base de datos para poder probarlas. */

export const FORMATS = {
  bolsa: "Bolsa",
  sachet: "Sachet",
  unidad: "Unidad",
} as const;
export type Format = keyof typeof FORMATS;

export function isFormat(value: string): value is Format {
  return value in FORMATS;
}

/** Nombre de la familia a partir del nombre de una presentación: "Almendra Laminada  250g" → "Almendra Laminada". */
export function familyNameOf(productName: string): string {
  return productName
    .replace(/[–-]\s*paquete de .*$/i, " ")
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:kg|kilo|kilos|kl|g|gr|grs|gramos|ml|und|unidades)\b\.?/gi, " ")
    .replace(/\b(?:x|por)\s+peso\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s*x–-]+$/i, "")
    .trim();
}

/** Clave para agrupar presentaciones de la misma familia sin importar tildes ni mayúsculas. */
export function familyKey(productName: string): string {
  return normalize(familyNameOf(productName));
}

/** Sachet: precio al público de unos $1.000 y pocos gramos. */
export function detectFormat(priceGross: number, grams: number | null): Format {
  if (grams === null) return "unidad";
  if (priceGross > 0 && priceGross <= 1100 && grams <= 40) return "sachet";
  return "bolsa";
}

/** Gramos en texto corto: 125 → "125 g", 1000 → "1 kg". */
export function fmtGrams(grams: number | null): string {
  if (grams === null) return "x unidad";
  if (grams >= 1000 && grams % 100 === 0) return `${(grams / 1000).toLocaleString("es-CO")} kg`;
  return `${Math.round(grams * 10) / 10} g`;
}

function slug(text: string, max = 10): string {
  return normalize(text).replace(/[^a-z0-9]+/g, "").toUpperCase().slice(0, max) || "PROD";
}

/** SKU único al estilo de Vitalic: VTL-ALMENDRA-125G, VTL-LINAZA-PAP20G. */
export function skuFor(familyName: string, grams: number | null, format: Format, taken: Set<string>): string {
  // El sachet no lleva los gramos en el código: pueden cambiar con el costo del insumo.
  const size = format === "sachet" ? "SACHET" : grams === null ? "UND" : `${Math.round(grams)}G`;
  const base = `VTL-${slug(familyName)}-${size}`;
  let sku = base;
  for (let n = 2; taken.has(sku); n++) sku = `${base}-${n}`;
  return sku;
}

export type Proportion = { rawMaterialId: number; parts: number };

/**
 * Reparte el contenido de una presentación según las proporciones de la receta,
 * en medios gramos y sin perder ni sobrar nada (método del mayor residuo).
 */
export function splitRecipe(recipe: Proportion[], totalGrams: number): { rawMaterialId: number; grams: number }[] {
  const valid = recipe.filter((r) => r.parts > 0);
  const sum = valid.reduce((t, r) => t + r.parts, 0);
  if (!sum || !(totalGrams > 0)) return [];
  const halves = Math.round(totalGrams * 2);
  const exact = valid.map((r) => (r.parts / sum) * halves);
  const base = exact.map(Math.floor);
  let left = halves - base.reduce((t, n) => t + n, 0);
  const order = exact.map((e, i) => ({ i, rest: e - base[i] })).sort((a, b) => b.rest - a.rest);
  for (const { i } of order) {
    if (left <= 0) break;
    base[i]++;
    left--;
  }
  return valid.map((r, i) => ({ rawMaterialId: r.rawMaterialId, grams: base[i] / 2 }));
}

/** Proporciones a partir de los gramos de una presentación existente (para editar una receta). */
export function proportionsFrom(components: { rawMaterialId: number; grams: number }[]): Proportion[] {
  const total = components.reduce((t, c) => t + c.grams, 0);
  if (!total) return [];
  return components.map((c) => ({ rawMaterialId: c.rawMaterialId, parts: Math.round((c.grams / total) * 1000) / 10 }));
}

/** Costo de la materia prima de una unidad (sin IVA). Null si algún insumo no tiene costo. */
export function materialCost(components: { grams: number; costPerKg: number | null }[], merma: number): number | null {
  if (components.length === 0) return null;
  let total = 0;
  for (const c of components) {
    if (!c.costPerKg || c.costPerKg <= 0) return null;
    total += (c.grams / 1000) * c.costPerKg;
  }
  return total * (1 + merma);
}

/** Margen sobre el precio sin IVA. */
export function marginOf(priceGross: number, ivaRate: number, costNet: number | null): number | null {
  if (costNet === null || !(priceGross > 0)) return null;
  const net = priceGross / (1 + ivaRate);
  return (net - costNet) / net;
}

/** Precio al público (con IVA) para lograr un margen, redondeado hacia arriba. */
export function priceForMargin(costNet: number, ivaRate: number, margin: number, step: number): number {
  const gross = (costNet / (1 - margin)) * (1 + ivaRate);
  return step > 0 ? Math.ceil(gross / step) * step : Math.round(gross);
}

/**
 * Gramos máximos que caben en un sachet de precio fijo sin bajar del margen mínimo.
 * Ej.: sachet de $1.000 con IVA 19 %, pimienta a $40.000/kg y margen 40 % → 12 g.
 */
export function sachetMaxGrams(opts: {
  priceGross: number;
  ivaRate: number;
  costPerKg: number;
  minMargin: number;
  packagingCost: number;
  merma: number;
}): number | null {
  const { priceGross, ivaRate, costPerKg, minMargin, packagingCost, merma } = opts;
  if (!(costPerKg > 0) || !(priceGross > 0)) return null;
  const budget = (priceGross / (1 + ivaRate)) * (1 - minMargin) - packagingCost;
  if (budget <= 0) return 0;
  return Math.floor((budget / ((costPerKg / 1000) * (1 + merma))) * 2) / 2;
}

export type VendtyCompound = { name: string; components: { grams: number; ingredient: string }[] };

/**
 * Lee el informe "Productos compuestos" de Vendty copiado de la pantalla:
 *   Mani Mixtura dulce Vitalic 125g <tab> 1493.2 <tab> 2521.01
 *   50Mani salado
 *   43Mani dulce
 *   30Uvas pasas
 *   unidad
 */
export function parseVendtyCompounds(text: string): VendtyCompound[] {
  const out: VendtyCompound[] = [];
  let current: VendtyCompound | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^unidad$/i.test(line)) {
      if (current && current.components.length) out.push(current);
      current = null;
      continue;
    }
    if (raw.includes("\t")) {
      const name = raw.split("\t")[0].trim();
      const looksLikeProduct = raw.split("\t").length >= 3 && name && !/^nombre producto$/i.test(name);
      current = looksLikeProduct ? { name, components: [] } : null;
      continue;
    }
    const m = line.match(/^(\d+(?:[.,]\d+)?)\s*(\D.*)$/);
    if (current && m) current.components.push({ grams: Number(m[1].replace(",", ".")), ingredient: m[2].trim() });
  }
  return out;
}
