import type { Settings } from "./settings-defaults";

export const NUT_CATEGORIES = ["frutos secos y semillas", "frutas deshidratadas y cereales"];

export function isNutCategory(category: string | null | undefined): boolean {
  return NUT_CATEGORIES.includes((category ?? "").toLowerCase().trim());
}

/** Margen bruto sobre el precio sin IVA. */
export function margin(priceNet: number, costNet: number): number | null {
  if (!priceNet || priceNet <= 0) return null;
  return (priceNet - costNet) / priceNet;
}

function roundUp(value: number, step: number): number {
  if (!step) return Math.round(value);
  return Math.ceil(value / step) * step;
}

export type PriceInput = {
  costNet: number | null; // costo unitario sin IVA (materia prima + empaque)
  currentPriceGross: number | null; // precio actual al público
  ivaRate: number;
  category: string | null;
  competitorPricesGross: number[]; // precios al público de la competencia
};

export type PriceRecommendation = {
  referenceGross: number | null;
  competitiveGross: number | null;
  floorGross: number | null;
  targetGross: number | null;
  recommendedGross: number | null;
  change: number | null;
  marginAtRecommended: number | null;
  rule:
    | "posicion-competitiva"
    | "piso-de-margen"
    | "margen-objetivo"
    | "sin-competencia"
    | "sin-competencia-minimo"
    | "sin-costo-solo-competencia"
    | "no-bajar"
    | "revisar-costo"
    | "sin-datos";
};

/**
 * Regla de precios de Vitalic:
 * 1. Referencia = precio más bajo de la competencia.
 * 2. Precio competitivo = referencia ajustada por la posición elegida (p. ej. -3 %).
 * 3. Nunca por debajo del piso que garantiza el margen mínimo.
 * 4. Sin competencia: precio para el margen objetivo de la categoría.
 * 5. Si los ajustes no permiten bajar precios, nunca recomienda menos que el actual.
 */
export function recommendPrice(input: PriceInput, s: Settings): PriceRecommendation {
  const iva = 1 + (input.ivaRate || 0);
  const step = s.redondeoPrecio;
  const current = input.currentPriceGross ?? null;
  // Un costo mayor al doble del precio casi siempre es un error de carga: no se recomienda nada.
  if (input.costNet && current && input.costNet > (current / iva) * 2) {
    return {
      referenceGross: null, competitiveGross: null, floorGross: null, targetGross: null,
      recommendedGross: null, change: null, marginAtRecommended: null, rule: "revisar-costo",
    };
  }
  const prices = input.competitorPricesGross.filter((p) => p > 0);
  const referenceGross = prices.length ? Math.min(...prices) : null;
  const competitiveGross = referenceGross !== null ? roundUp(referenceGross * (1 + s.posicionCompetencia), step) : null;
  const hasCost = input.costNet !== null && input.costNet > 0;
  const floorGross = hasCost ? roundUp((input.costNet! / (1 - s.margenMinimo)) * iva, step) : null;
  const target = isNutCategory(input.category) ? s.margenObjetivoFrutosSecos : s.margenObjetivoEspecias;
  const targetGross = hasCost ? roundUp((input.costNet! / (1 - target)) * iva, step) : null;

  let recommendedGross: number | null;
  let rule: PriceRecommendation["rule"];
  if (competitiveGross !== null && floorGross !== null) {
    recommendedGross = Math.max(competitiveGross, floorGross);
    rule = floorGross > competitiveGross ? "piso-de-margen" : "posicion-competitiva";
  } else if (competitiveGross !== null) {
    recommendedGross = competitiveGross;
    rule = "sin-costo-solo-competencia";
  } else if (targetGross !== null && current) {
    // Sin competencia se mantiene el precio actual, salvo que esté por debajo del piso de margen.
    recommendedGross = Math.max(current, floorGross ?? 0);
    rule = floorGross !== null && floorGross > current ? "sin-competencia-minimo" : "sin-competencia";
  } else if (targetGross !== null) {
    recommendedGross = targetGross;
    rule = "margen-objetivo";
  } else {
    recommendedGross = null;
    rule = "sin-datos";
  }

  if (recommendedGross !== null && current && !s.permitirBajarPrecios && recommendedGross < current) {
    recommendedGross = current;
    rule = "no-bajar";
  }

  return {
    referenceGross,
    competitiveGross,
    floorGross,
    targetGross,
    recommendedGross,
    change: recommendedGross !== null && current ? recommendedGross - current : null,
    marginAtRecommended:
      recommendedGross !== null && hasCost ? margin(recommendedGross / iva, input.costNet!) : null,
    rule,
  };
}

export const RULE_LABELS: Record<PriceRecommendation["rule"], string> = {
  "posicion-competitiva": "Posición frente a la competencia",
  "piso-de-margen": "Piso de margen: la competencia vende muy barato",
  "margen-objetivo": "Producto nuevo: margen objetivo",
  "sin-competencia": "Sin competencia: se mantiene",
  "sin-competencia-minimo": "Sin competencia: sube al margen mínimo",
  "revisar-costo": "Revisar costo: parece mal cargado",
  "sin-costo-solo-competencia": "Sin costo cargado: solo competencia",
  "no-bajar": "Se mantiene: no se bajan precios",
  "sin-datos": "Sin costo ni competencia",
};
