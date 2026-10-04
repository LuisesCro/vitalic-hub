/** Reglas del cuadre de caja. Sin dependencias de base de datos para poder probarlas. */

export const DENOMINATIONS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50] as const;

export const PAYMENT_METHODS = [
  { key: "salesCash", label: "Efectivo" },
  { key: "salesCard", label: "Tarjetas (datáfono)" },
  { key: "salesNequi", label: "Nequi" },
  { key: "salesDaviplata", label: "Daviplata" },
  { key: "salesBreb", label: "Llave / Bre-B" },
  { key: "salesTransfer", label: "Transferencia" },
  { key: "salesOther", label: "Otros" },
] as const;

export type PaymentKey = (typeof PAYMENT_METHODS)[number]["key"];
export type SalesByMethod = Record<PaymentKey, number>;

export const MOVEMENT_KINDS = {
  ingreso: { label: "Entrada de efectivo", sign: 1, categories: ["Cambio / sencillo", "Abono de cliente", "Otro ingreso"] },
  egreso: { label: "Pago desde la caja", sign: -1, categories: ["Pago a proveedor", "Gasto menor", "Domicilio / transporte", "Aseo / cafetería", "Otro gasto"] },
  retiro: { label: "Retiro o consignación", sign: -1, categories: ["Consignación al banco", "Retiro del dueño", "Traslado a caja fuerte"] },
} as const;

export type MovementKind = keyof typeof MOVEMENT_KINDS;

export function isMovementKind(value: string): value is MovementKind {
  return value in MOVEMENT_KINDS;
}

export function sumDenominations(counts: Record<string, number>): number {
  return DENOMINATIONS.reduce((total, d) => total + d * (Number(counts[String(d)]) || 0), 0);
}

export function totalSales(s: SalesByMethod): number {
  return PAYMENT_METHODS.reduce((t, m) => t + (s[m.key] || 0), 0);
}

/** Efectivo que debería haber en el cajón al cerrar. */
export function expectedCash(
  openingCash: number,
  salesCash: number,
  movements: { kind: string; amount: number }[],
): number {
  const net = movements.reduce((t, m) => t + (isMovementKind(m.kind) ? MOVEMENT_KINDS[m.kind].sign * m.amount : 0), 0);
  return openingCash + salesCash + net;
}

/** Faltantes o sobrantes menores a este valor se consideran cuadre exacto (monedas). */
export const TOLERANCE = 500;

export function differenceStatus(diff: number): "cuadra" | "sobra" | "falta" {
  if (Math.abs(diff) < TOLERANCE) return "cuadra";
  return diff > 0 ? "sobra" : "falta";
}

/**
 * Lleva la forma de pago de Vendty a un medio del cuadre. Los pagos mixtos
 * ("efectivo,Nequi") no traen el valor de cada parte y se devuelven como null.
 */
export function vendtyMethodKey(method: string | null): PaymentKey | null {
  const m = (method ?? "").toLowerCase().trim();
  if (!m || m.includes(",")) return null;
  if (m === "efectivo") return "salesCash";
  if (m.startsWith("tarjeta")) return "salesCard";
  if (m === "nequi") return "salesNequi";
  if (m === "daviplata") return "salesDaviplata";
  if (m.includes("bre-b") || m.includes("breb") || m.includes("bre b") || m.includes("llave")) return "salesBreb";
  if (m.includes("transfer") || m.includes("bancolombia")) return "salesTransfer";
  return "salesOther";
}

/** Convierte "1.250.000" o "1250000" a número; vacío es 0. */
export function parsePesos(value: FormDataEntryValue | null): number {
  const n = Number(String(value ?? "").replace(/[^0-9-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
