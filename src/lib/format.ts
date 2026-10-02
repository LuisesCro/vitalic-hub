const cop = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat("es-CO", { style: "percent", maximumFractionDigits: 1 });

export const fmtCOP = (v: number | null | undefined) => (v === null || v === undefined ? "—" : cop.format(v));
export const fmtNum = (v: number | null | undefined) => (v === null || v === undefined ? "—" : num.format(v));
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : pct.format(v));
export const fmtKg = (grams: number | null | undefined) => (grams === null || grams === undefined ? "—" : `${num.format(grams / 1000)} kg`);

const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export function fmtMonth(isoMonth: string) {
  const [y, m] = isoMonth.split("-").map(Number);
  return `${months[m - 1]} ${y}`;
}

export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}
