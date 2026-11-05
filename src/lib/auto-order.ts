/**
 * Pedido automático: con lo que se está acabando y los precios por proveedor, decide a quién pedirle
 * cada insumo y cuántos kilos. Sin base de datos para poder probarlo; la sincronización vive en auto-order-sync.ts.
 */

/** Lo mínimo que necesita la decisión de cada precio (coincide con KgPrice de supplier-prices). */
export type PriceOption = {
  supplierId: number;
  supplier: string;
  pricePerKg: number;
  date: string | null;
  reference?: boolean;
  packKg: number | null;
  kind: string;
};

/** Un precio con más de estos días se considera viejo: solo se usa si no hay ninguno reciente. */
export const PRECIO_VIEJO_DIAS = 180;

const daysBetween = (fromISO: string, toISO: string) => (Date.parse(toISO) - Date.parse(fromISO)) / 86_400_000;

export type SupplierPick = {
  best: PriceOption;
  /** El precio del elegido tiene más de PRECIO_VIEJO_DIAS: hay que confirmarlo con el proveedor. */
  stale: boolean;
  /** El otro proveedor más barato después del elegido (para mostrar la comparación). */
  runnerUp: PriceOption | null;
  /** A quién se le compró la última vez (puede ser el mismo elegido). */
  last: PriceOption | null;
  /** Ahorro por kilo frente al último proveedor, si el elegido es otro y más barato. */
  savingPerKg: number;
};

/**
 * El proveedor con el menor precio por kilo (sin IVA) entre los precios recientes; si no hay recientes, entre todos.
 * A igual precio gana el más reciente y, a igual fecha, una compra real antes que una referencia.
 */
export function pickSupplier(prices: PriceOption[], todayISO: string): SupplierPick | null {
  const valid = prices.filter((p) => p.pricePerKg > 0);
  if (valid.length === 0) return null;
  const isFresh = (p: PriceOption) => p.date !== null && daysBetween(p.date, todayISO) <= PRECIO_VIEJO_DIAS;
  const fresh = valid.filter(isFresh);
  const pool = fresh.length ? fresh : valid;
  const sorted = [...pool].sort(
    (a, b) => a.pricePerKg - b.pricePerKg || (b.date ?? "").localeCompare(a.date ?? "") || Number(!!a.reference) - Number(!!b.reference),
  );
  const best = sorted[0];
  const last = [...valid].filter((p) => !p.reference).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0] ?? null;
  return {
    best,
    stale: !isFresh(best),
    runnerUp: sorted.find((p) => p.supplierId !== best.supplierId) ?? null,
    last,
    savingPerKg: last && last.supplierId !== best.supplierId ? Math.max(0, last.pricePerKg - best.pricePerKg) : 0,
  };
}

/**
 * Kilos a pedir: lo que se gasta en `coverDays` días menos lo que queda, de 5 en 5 y mínimo 5 kg;
 * 10 kg si no hay consumo medido. Si el proveedor vende por bulto o caja se lleva a unidades completas:
 * sube si no pasa de 1,5 veces lo necesario, o baja si sigue cubriendo al menos 3/4; si no, se dejan los kilos.
 */
export function suggestOrderKg(gramsPerDay: number, stockKg: number, packKg: number | null, coverDays = 30): number {
  const need = gramsPerDay > 0 ? Math.max(5, Math.ceil(((gramsPerDay * coverDays) / 1000 - Math.max(stockKg, 0)) / 5) * 5) : 10;
  if (packKg && packKg > 1) {
    const packs = Math.max(1, Math.ceil(need / packKg - 0.05));
    const full = Math.round(packs * packKg * 1000) / 1000;
    if (full <= need * 1.5) return full;
    const less = Math.round((packs - 1) * packKg * 1000) / 1000;
    if (packs > 1 && less >= need * 0.75) return less;
  }
  return need;
}

/** Un insumo que hay que pedir y por qué. */
export type Need = { rawMaterialId: number; name: string; stockKg: number; reason: "agotado" | "bajo" | "urgente" };

/** Lo que ya hay abierto para un insumo y que impide (o no) volver a pedirlo. */
export type OpenState = {
  /** Hay un renglón por pedir agregado a mano (por Luis o Paula). */
  manualDraft: boolean;
  /** Ya va en una cotización generada que todavía no llegó (no hay compra posterior). */
  inFlight: boolean;
  /** Lo descartaron del pedido automático hace poco. */
  dismissed: boolean;
  /** Lo marcaron como «Ya lo pedí» hace poco. */
  orderedRecently: boolean;
};

export type AutoLine = { rawMaterialId: number; name: string; supplierId: number; qtyKg: number };

/**
 * El pedido automático completo: un renglón por insumo que se acaba y que nadie está pidiendo ya.
 * Los que no tienen ningún precio de proveedor quedan en `noSupplier` para que Luis los asigne.
 */
export function planAutoOrder(
  needs: Need[],
  prices: Map<number, PriceOption[]>,
  consumption: Map<number, number>,
  open: Map<number, OpenState>,
  todayISO: string,
): { lines: AutoLine[]; noSupplier: Need[] } {
  const lines: AutoLine[] = [];
  const noSupplier: Need[] = [];
  const seen = new Set<number>();
  for (const n of needs) {
    if (seen.has(n.rawMaterialId)) continue;
    seen.add(n.rawMaterialId);
    const o = open.get(n.rawMaterialId);
    if (o && (o.manualDraft || o.inFlight || o.dismissed || o.orderedRecently)) continue;
    const pick = pickSupplier(prices.get(n.rawMaterialId) ?? [], todayISO);
    if (!pick) {
      noSupplier.push(n);
      continue;
    }
    lines.push({
      rawMaterialId: n.rawMaterialId, name: n.name, supplierId: pick.best.supplierId,
      qtyKg: suggestOrderKg(consumption.get(n.rawMaterialId) ?? 0, n.stockKg, pick.best.packKg),
    });
  }
  return { lines, noSupplier };
}
