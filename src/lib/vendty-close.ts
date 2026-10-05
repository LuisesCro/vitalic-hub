/** Lector del informe "Cierre de caja" de Vendty (PDF): ventas del día por medio de pago y por producto. */

export type VendtyCloseItem = { name: string; quantity: number; discount: number; value: number };
export type VendtyClose = {
  date: string; // AAAA-MM-DD
  salesCount: number;
  payments: Record<string, number>; // "efectivo", "nequi", "tarjeta credito", "tarjeta debito"…
  total: number;
  items: VendtyCloseItem[];
};

const toNum = (s: string) => Number(s.replace(/,/g, "")) || 0;

export function parseVendtyClose(text: string): VendtyClose | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const date = text.match(/Fecha:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
  if (!date) return null;
  const payments: Record<string, number> = {};
  let total = 0;
  let salesCount = 0;
  let inItems = false;
  const items: VendtyCloseItem[] = [];
  for (const line of lines) {
    if (/^Resumen de Productos Vendidos/i.test(line)) { inItems = true; continue; }
    if (!inItems) {
      const pay = line.match(/^(\d+)\s+(Efectivo|Nequi|Daviplata|Tarjeta cr[eé]dito|Tarjeta d[eé]bito|Transferencia|Bre-?B|Llave|Otros?)\s+([\d,]+(?:\.\d+)?)$/i);
      if (pay) payments[pay[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")] = (payments[pay[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")] ?? 0) + toNum(pay[3]);
      const tot = line.match(/^(\d+)\s+Total ventas\s+([\d,]+(?:\.\d+)?)$/i);
      if (tot) { salesCount = Number(tot[1]); total = toNum(tot[2]); }
      continue;
    }
    if (/^Descripci[oó]n\s+Cantidad/i.test(line)) continue;
    const row = line.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(\d[\d,]*(?:\.\d+)?)\s+(\d[\d,]*(?:\.\d+)?)$/);
    if (row) items.push({ name: row[1].replace(/\s+/g, " ").trim(), quantity: Number(row[2]), discount: toNum(row[3]), value: toNum(row[4]) });
  }
  return { date, salesCount, payments, total, items };
}
