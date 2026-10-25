/** Reglas de las alertas de inventario. Sin base de datos para poder probarlas. */

export type AlertLevel = "agotado" | "bajo";

/**
 * Una bolsa de producto avisa si no hay, si quedan pocas (minUnits o menos) o si, al ritmo de venta,
 * alcanza para menos de minDays días. Sin venta reciente un producto con stock bajo avisa, pero uno en cero no.
 */
export function bagAlert(stock: number, perDay: number, minUnits: number, minDays: number): { level: AlertLevel; days: number | null } | null {
  const days = perDay > 0 ? stock / perDay : null;
  // Sin venta reciente un producto en cero no es una urgencia (puede estar descontinuado): no avisa.
  if (stock <= 0) return perDay > 0 ? { level: "agotado", days: 0 } : null;
  if (perDay <= 0) return stock <= minUnits ? { level: "bajo", days } : null;
  if (stock <= minUnits || (days !== null && days < minDays)) return { level: "bajo", days };
  return null;
}

/** Un insumo avisa si se agotó, si llegó a su mínimo o si alcanza para menos de minDays días. */
export function rawAlert(stockGrams: number, minGrams: number, perDay: number, minDays: number): { level: AlertLevel; days: number | null } | null {
  const days = perDay > 0 ? stockGrams / perDay : null;
  // Un insumo que no se vende ni tiene mínimo no avisa aunque esté en cero.
  if (stockGrams <= 0) return perDay > 0 || minGrams > 0 ? { level: "agotado", days: 0 } : null;
  if ((minGrams > 0 && stockGrams <= minGrams) || (days !== null && days < minDays)) return { level: "bajo", days };
  return null;
}
