/** Reglas de la caja registradora: totales con IVA, pagos mixtos y cambio. Sin base de datos para poder probarlas. */

export const POS_METHODS = {
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  nequi: "Nequi",
  daviplata: "Daviplata",
  breb: "Llave / Bre-B",
  transferencia: "Transferencia",
} as const;
export type PosMethod = keyof typeof POS_METHODS;

export function isPosMethod(v: string): v is PosMethod {
  return v in POS_METHODS;
}

/** Cómo se guarda cada medio en sale_lines (mismo estilo que Vendty, para los reportes). */
export const SALE_LINE_METHOD: Record<PosMethod, string> = {
  efectivo: "efectivo", tarjeta: "tarjeta_debito", nequi: "Nequi", daviplata: "Daviplata", breb: "Breb", transferencia: "transferencia",
};

/** Medio de pago → columna del cuadre de caja. */
export const CASH_COLUMN: Record<PosMethod, "salesCash" | "salesCard" | "salesNequi" | "salesDaviplata" | "salesBreb" | "salesTransfer"> = {
  efectivo: "salesCash", tarjeta: "salesCard", nequi: "salesNequi", daviplata: "salesDaviplata", breb: "salesBreb", transferencia: "salesTransfer",
};

export type CartLine = { unitGross: number; quantity: number; ivaRate: number };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Total de una línea con IVA, redondeado al peso (los precios al público son pesos enteros). */
export function lineGross(l: CartLine): number {
  return Math.round(l.unitGross * l.quantity);
}

export function cartTotals(lines: CartLine[], discountGross = 0) {
  const gross = lines.reduce((t, l) => t + lineGross(l), 0);
  const discount = Math.min(Math.max(0, Math.round(discountGross)), gross);
  const total = gross - discount;
  // El IVA se calcula sobre lo que realmente paga el cliente, repartiendo el descuento en proporción.
  const factor = gross > 0 ? total / gross : 0;
  let net = 0;
  for (const l of lines) net += (lineGross(l) * factor) / (1 + l.ivaRate);
  net = r2(net);
  return { gross, discount, total, net, tax: r2(total - net) };
}

export type Payment = { method: PosMethod; amount: number };

/**
 * Valida los pagos y calcula el cambio. El cambio solo sale del efectivo recibido:
 * lo que se paga con tarjeta, Nequi, etc. no puede pasar de lo que falta por cobrar.
 */
export function settle(total: number, payments: Payment[]): { ok: true; paid: Payment[]; change: number; cashReceived: number } | { ok: false; error: string } {
  const valid = payments.filter((p) => p.amount > 0);
  if (valid.length === 0) return { ok: false, error: "Falta registrar el pago" };
  const cash = valid.filter((p) => p.method === "efectivo").reduce((t, p) => t + p.amount, 0);
  const other = valid.filter((p) => p.method !== "efectivo").reduce((t, p) => t + p.amount, 0);
  if (other > total) return { ok: false, error: "Lo pagado sin efectivo no puede ser mayor al total" };
  const cashDue = total - other;
  if (cash < cashDue) return { ok: false, error: `Falta cobrar ${Math.round(cashDue - cash)}` };
  const change = Math.round(cash - cashDue);
  // Se guardan los valores netos: el efectivo sin el cambio devuelto.
  const paid: Payment[] = valid.map((p) => (p.method === "efectivo" ? { method: p.method, amount: Math.round(p.amount) - change } : { method: p.method, amount: Math.round(p.amount) }));
  return { ok: true, paid: paid.filter((p) => p.amount > 0), change, cashReceived: cash };
}

/** Billetes que se ofrecen como botones rápidos, desde lo mínimo que cubre el total. */
export function quickCash(total: number): number[] {
  const bills = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const out = new Set<number>([total]);
  for (const b of bills) {
    const up = Math.ceil(total / b) * b;
    if (up >= total && up - total < b * 1.01) out.add(up);
  }
  for (const b of bills) if (b >= total) out.add(b);
  return [...out].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 4);
}

/** Productos que se venden por gramos ("x peso"): el precio es por gramo y la cantidad son gramos. */
export function soldByWeight(name: string): boolean {
  return /\bx\s*peso\b/i.test(name);
}
