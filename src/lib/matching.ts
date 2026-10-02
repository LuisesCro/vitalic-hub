import { normalize } from "./units";

/** Quita el peso y la presentación: "Almendra Laminada 125g" -> "almendra laminada". */
export function baseName(productName: string): string {
  return normalize(productName)
    .replace(/paquete de \d+.*$/, " ")
    .replace(/\d+(?:[.,]\d+)?\s*(?:kg|kilo|kilos|g|gr|grs|gramos|ml|und|unidades)\b/g, " ")
    .replace(/\b(x|por) peso\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Busca el insumo que corresponde a un nombre (de producto o de línea de factura).
 * Prefiere coincidencia exacta del nombre base; si no, el insumo con el nombre más
 * largo contenido en el texto ("almendra laminada" gana sobre "almendra").
 */
export function matchRawMaterial<T extends { id: number; name: string }>(text: string, materials: T[]): T | null {
  const target = baseName(text);
  const exact = materials.find((m) => normalize(m.name) === target);
  if (exact) return exact;
  const words = ` ${target} `;
  let best: T | null = null;
  let bestLen = 0;
  for (const m of materials) {
    const name = normalize(m.name);
    if (name.length > bestLen && words.includes(` ${name} `)) {
      best = m;
      bestLen = name.length;
    }
  }
  return best;
}

/**
 * Encuentra el producto propio que corresponde a una línea del catálogo de un
 * competidor: mismo peso (si se conoce) y mismo nombre base.
 */
export function matchProduct<T extends { id: number; name: string; grams: number | null }>(
  competitorName: string,
  grams: number | null,
  products: T[],
): T | null {
  // Sin peso conocido solo se compara contra productos que tampoco tienen peso (p. ej. "x peso").
  const sameSize = grams
    ? products.filter((p) => p.grams !== null && Math.abs(p.grams - grams) < 1)
    : products.filter((p) => p.grams === null);
  const target = baseName(competitorName);
  const exact = sameSize.find((p) => baseName(p.name) === target);
  if (exact) return exact;
  const candidates = sameSize.map((p) => ({ id: p.id, name: baseName(p.name), product: p }));
  const found = matchRawMaterial(competitorName, candidates);
  return found ? found.product : null;
}
