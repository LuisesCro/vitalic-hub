/** Cuentas por pagar: estado de una factura según lo pagado y su vencimiento. */

export const PAYMENT_METHODS_SUPPLIER = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  nequi: "Nequi",
  daviplata: "Daviplata",
  breb: "Llave / Bre-B",
  cheque: "Cheque",
  retencion: "Retención o descuento (no sale dinero)",
} as const;
export type SupplierPaymentMethod = keyof typeof PAYMENT_METHODS_SUPPLIER;

export function isSupplierMethod(v: string): v is SupplierPaymentMethod {
  return v in PAYMENT_METHODS_SUPPLIER;
}

export type PayStatus = "pagada" | "abonada" | "pendiente" | "vencida";

export const PAY_STATUS_LABEL: Record<PayStatus, string> = {
  pagada: "Pagada",
  abonada: "Abonada",
  pendiente: "Por pagar",
  vencida: "Vencida",
};

/** Diferencias de menos de $100 se consideran saldadas (redondeos). */
const TOLERANCE = 100;

export function payStatus(total: number, paid: number, dueDate: string | null, today: string) {
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  if (total <= 0 || balance < TOLERANCE) return { status: "pagada" as PayStatus, balance: 0, daysOverdue: 0 };
  const overdue = dueDate !== null && dueDate < today;
  const daysOverdue = overdue ? Math.round((Date.parse(today) - Date.parse(dueDate!)) / 86400000) : 0;
  if (overdue) return { status: "vencida" as PayStatus, balance, daysOverdue };
  return { status: (paid > 0 ? "abonada" : "pendiente") as PayStatus, balance, daysOverdue: 0 };
}

export function daysUntil(date: string | null, today: string): number | null {
  if (!date) return null;
  return Math.round((Date.parse(date) - Date.parse(today)) / 86400000);
}
