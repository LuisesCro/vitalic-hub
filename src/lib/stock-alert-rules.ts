/** Reglas de las alertas de inventario. Sin base de datos para poder probarlas. */

export type AlertLevel = "agotado" | "bajo";

/**
 * Una bolsa de producto avisa si no hay, si quedan pocas (minUnits o menos) o si, al ritmo de venta,
 * alcanza para menos de minDays días. Sin venta reciente solo avisa por pocas unidades.
 */
export function bagAlert(stock: number, perDay: number, minUnits: number, minDays: number): { level: AlertLevel; days: number | null } | null {
  const days = perDay > 0 ? stock / perDay : null;
  if (stock <= 0) return { level: "agotado", days: 0 };
  if (stock <= minUnits || (days !== null && days < minDays)) return { level: "bajo", days };
  return null;
}

/** Un insumo avisa si se agotó, si llegó a su mínimo o si alcanza para menos de minDays días. */
export function rawAlert(stockGrams: number, minGrams: number, perDay: number, minDays: number): { level: AlertLevel; days: number | null } | null {
  const days = perDay > 0 ? stockGrams / perDay : null;
  if (stockGrams <= 0) return { level: "agotado", days: 0 };
  if ((minGrams > 0 && stockGrams <= minGrams) || (days !== null && days < minDays)) return { level: "bajo", days };
  return null;
}
