import type { Settings } from "./settings-defaults";

/**
 * Gramos de un sachet de $1.000 según el costo de su insumo (sin IVA).
 * Regla de Vitalic: todos pesan 20 g; si 20 g del insumo cuestan más de $300, el sachet baja de gramos
 * hasta quedar en unos $350 de costo (al gramo más cercano). Ej.: cardamomo a $75.000/kg → 5 g.
 */
export function sachetGramsFor(costPerKg: number, s: Pick<Settings, "sachetGramos" | "sachetCostoUmbral" | "sachetCostoMaximo">): number {
  const base = s.sachetGramos;
  if (!(costPerKg > 0)) return base;
  const perGram = costPerKg / 1000;
  if (perGram * base <= s.sachetCostoUmbral) return base;
  return Math.max(1, Math.min(base, Math.round(s.sachetCostoMaximo / perGram)));
}
