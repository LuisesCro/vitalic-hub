/** Normaliza texto para comparar descripciones: minúsculas, sin tildes ni símbolos. */
export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9,.\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

/**
 * Gramos de una presentación a partir de su nombre: "Almendra 125g" -> 125,
 * "Linaza 20g – Paquete de 10 und" -> 200, "Glutamato 1 kg" -> 1000.
 * Devuelve null cuando el nombre no trae un peso ("x peso", "2 pepitas").
 */
export function gramsFromName(name: string): number | null {
  const text = normalize(name);
  const kg = text.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilo|kilos|kl)\b/);
  const g = text.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grs|gramos)\b/);
  let grams: number | null = null;
  if (g) grams = toNumber(g[1]);
  else if (kg) grams = toNumber(kg[1]) * 1000;
  if (grams === null) return null;
  const pack = text.match(/paquete de (\d+)/);
  if (pack) grams *= Number(pack[1]);
  return grams;
}

/**
 * Kilos por unidad facturada. Usa el código de unidad DIAN cuando lo trae
 * (KGM = kilo, GRM = gramo, LBR = libra) y si no, busca el peso en la descripción.
 */
export function kgPerInvoiceUnit(description: string, unitCode?: string | null): number | null {
  const code = (unitCode ?? "").toUpperCase();
  if (code === "KGM" || code === "KG") return 1;
  if (code === "GRM") return 0.001;
  if (code === "LBR") return 0.5;
  const grams = gramsFromName(description);
  if (grams !== null) return grams / 1000;
  // Medidas de plaza: la arroba son 25 libras (12,5 kg) y la libra son 500 g.
  const text = normalize(description);
  if (/\barrobas?\b/.test(text)) return 12.5;
  if (/\b(?:libras?|lb|lbs)\b/.test(text)) return 0.5;
  return null;
}
