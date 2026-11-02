/** Cómo vende un proveedor: por bulto, caja, arroba, bolsa o kilo, y cuántas unidades hay que pedir para cubrir unos kilos. */

export type PackKind = "bulto" | "caja" | "arroba" | "cojín" | "bolsa" | "kilo" | "unidad";

const PLURAL: Record<PackKind, string> = { bulto: "bultos", caja: "cajas", arroba: "arrobas", "cojín": "cojines", bolsa: "bolsas", kilo: "kilos", unidad: "unidades" };

const plain = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Tipo de empaque a partir de la descripción de la factura o cotización ("CANELA ASTILLA CAJA X 10 KL" → caja). */
export function packLabel(description: string, unit: string | null | undefined, packKg: number | null): PackKind {
  const t = ` ${plain(description)} ${plain(unit ?? "")} `;
  if (/\bbultos?\b/.test(t)) return "bulto";
  if (/\b(cajas?|cja|cjs)\b/.test(t)) return "caja";
  if (/\bcojin(es)?\b/.test(t)) return "cojín";
  if (/\barrobas?\b|@/.test(t)) return "arroba";
  if (packKg === 1) return "kilo";
  if (packKg !== null && packKg > 0 && packKg < 1) return "bolsa";
  return "unidad";
}

export const kindPlural = (k: PackKind) => PLURAL[k];

const kgText = (kg: number) => `${kg.toLocaleString("es-CO", { maximumFractionDigits: 2 })} kg`;

/** Cuántas unidades del proveedor se necesitan para cubrir `qtyKg` (sube al entero; 0,05 de tolerancia). */
export function packRecommendation(qtyKg: number, packKg: number | null, kind: PackKind) {
  if (!packKg || packKg <= 0 || kind === "kilo") return null;
  const packs = qtyKg > 0 ? Math.max(1, Math.ceil(qtyKg / packKg - 0.05)) : 1;
  const totalKg = Math.round(packs * packKg * 1000) / 1000;
  return {
    packs,
    totalKg,
    exact: Math.abs(totalKg - qtyKg) < 0.001,
    text: `${packs} ${packs === 1 ? kind : PLURAL[kind]} de ${kgText(packKg)} = ${kgText(totalKg)}`,
    sells: `${kind[0].toUpperCase()}${kind.slice(1)} de ${kgText(packKg)}`,
  };
}
