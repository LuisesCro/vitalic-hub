import { packagingCostFor, type Settings } from "./settings-defaults";

/**
 * Costo unitario sin IVA de una bolsa: materia prima al costo promedio del insumo
 * (más la merma) y empaque. Si el insumo no tiene costo, usa el costo de Vendty.
 */
export function unitCost(
  p: { grams: number | null; vendtyCost: number | null; packagingCost: number },
  rawAvgCostPerKg: number | null,
  s: Settings,
): number | null {
  const packaging = p.packagingCost || packagingCostFor(p.grams, s);
  if (p.grams && rawAvgCostPerKg && rawAvgCostPerKg > 0) {
    const fromRaw = (p.grams / 1000) * rawAvgCostPerKg * (1 + s.mermaEmpaque);
    // Si difiere más de 3 veces del costo de Vendty, el costo del insumo está mal cargado
    // (p. ej. un ingrediente con costo por unidad en lugar de por gramo): se usa el de Vendty.
    const vendty = p.vendtyCost && p.vendtyCost > 0 ? p.vendtyCost : null;
    if (!vendty || (fromRaw <= vendty * 3 && fromRaw >= vendty / 3)) return fromRaw + packaging;
  }
  if (p.vendtyCost && p.vendtyCost > 0) return p.vendtyCost + packaging;
  return null;
}

/**
 * Costo unitario sin IVA según la receta (uno o varios insumos) más el empaque.
 * Si algún insumo no tiene costo o el resultado se aleja más de 3 veces del costo
 * de Vendty (costo mal cargado), usa el de Vendty.
 */
export function unitCostFromComponents(
  p: { grams: number | null; vendtyCost: number | null; packagingCost: number },
  components: { grams: number; costPerKg: number | null }[],
  s: Settings,
): number | null {
  const packaging = p.packagingCost || packagingCostFor(p.grams, s);
  const vendty = p.vendtyCost && p.vendtyCost > 0 ? p.vendtyCost : null;
  if (components.length && components.every((c) => c.costPerKg && c.costPerKg > 0)) {
    const material = components.reduce((t, c) => t + (c.grams / 1000) * c.costPerKg!, 0) * (1 + s.mermaEmpaque);
    if (!vendty || (material <= vendty * 3 && material >= vendty / 3)) return material + packaging;
  }
  return vendty ? vendty + packaging : null;
}
