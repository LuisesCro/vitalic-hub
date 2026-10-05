import type { Settings } from "./settings-defaults";

/**
 * Cotización por kilo o por bulto: el margen baja según la cantidad y el precio
 * nunca supera lo que el cliente pagaría comprando en bolsas.
 */
export type BulkQuote = {
  kg: number;
  tier: 1 | 2 | 3;
  tierLabel: string;
  margin: number;
  pricePerKg: number; // con IVA
  total: number; // con IVA
  floorPerKg: number; // precio mínimo negociable por kilo, con IVA
  floorTotal: number;
  retailTotal: number | null; // lo que pagaría en bolsas
  savings: number | null; // fracción de ahorro frente a bolsas
  cappedByRetail: boolean;
};

const ceilTo = (v: number, step: number) => (step > 0 ? Math.ceil(v / step) * step : Math.round(v));

export function tierFor(kg: number, s: Settings): { tier: 1 | 2 | 3; margin: number; label: string } {
  if (kg >= s.granelDesdeKg3) return { tier: 3, margin: s.margenGranel3, label: `Precio de bulto (desde ${s.granelDesdeKg3} kg)` };
  if (kg >= s.granelDesdeKg2) return { tier: 2, margin: s.margenGranel2, label: `Precio por cantidad (desde ${s.granelDesdeKg2} kg)` };
  return { tier: 1, margin: s.margenGranel1, label: "Precio por kilo" };
}

export function quoteBulk(opts: {
  kg: number;
  costPerKg: number; // materia prima sin IVA
  ivaRate: number;
  retailPerKg: number | null; // precio por kilo de la bolsa más grande, con IVA
  settings: Settings;
}): BulkQuote | null {
  const { kg, costPerKg, ivaRate, retailPerKg, settings: s } = opts;
  if (!(kg > 0) || !(costPerKg > 0)) return null;
  const { tier, margin, label } = tierFor(kg, s);
  const byMargin = (m: number) => (costPerKg / (1 - m)) * (1 + ivaRate);
  let pricePerKg = ceilTo(byMargin(margin), 100);
  let capped = false;
  // Nunca más caro que comprar en bolsas: si pasa, se iguala al precio de bolsa con un 5 % menos.
  if (retailPerKg && pricePerKg > retailPerKg * 0.95) {
    pricePerKg = Math.max(ceilTo(retailPerKg * 0.95, 100), ceilTo(byMargin(s.margenGranelPiso), 100));
    capped = true;
  }
  const floorPerKg = Math.min(pricePerKg, ceilTo(byMargin(s.margenGranelPiso), 100));
  const total = ceilTo(pricePerKg * kg, 500);
  const retailTotal = retailPerKg ? Math.round(retailPerKg * kg) : null;
  return {
    kg, tier, tierLabel: label, margin, pricePerKg, total,
    floorPerKg, floorTotal: ceilTo(floorPerKg * kg, 500),
    retailTotal, savings: retailTotal ? 1 - total / retailTotal : null, cappedByRetail: capped,
  };
}

/** Utilidad de una venta: sobre el precio sin IVA y frente al costo (lo que el dueño ve en pesos y en %). */
export function profitOf(totalGross: number, ivaRate: number, cost: number) {
  const net = totalGross / (1 + ivaRate);
  const profit = net - cost;
  return { net, cost, profit, margin: net > 0 ? profit / net : 0, markup: cost > 0 ? profit / cost : 0 };
}

/** Producto cotizable por kilo, tal como llega al navegador: precios por nivel ya calculados, sin costos. */
export type PublicQuoteItem = {
  familyId: number;
  name: string;
  ivaRate: number;
  retailPerKg: number | null;
  stockKg: number | null;
  tiers: { pricePerKg: number; capped: boolean }[]; // niveles 1, 2 y 3
  floorPerKg: number;
  costPerKg?: number; // solo administradores
};

/** Misma cuenta que el servidor, con los precios por nivel que ya vienen calculados. */
export function quoteFromTiers(item: PublicQuoteItem, kg: number, s: Settings) {
  const { tier, margin, label } = tierFor(kg, s);
  const level = item.tiers[tier - 1];
  const total = ceilTo(level.pricePerKg * kg, 500);
  const floorPerKg = Math.min(item.floorPerKg, level.pricePerKg);
  const retailTotal = item.retailPerKg ? Math.round(item.retailPerKg * kg) : null;
  return {
    tierLabel: label, margin, pricePerKg: level.pricePerKg, total, cappedByRetail: level.capped,
    floorPerKg, floorTotal: ceilTo(floorPerKg * kg, 500),
    retailTotal, savings: retailTotal ? 1 - total / retailTotal : null,
  };
}
