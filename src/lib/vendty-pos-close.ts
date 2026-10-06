/**
 * Cierre de caja numerado de Vendty POS (pos.vendty.com → Cajas → Cierres, guardado como PDF):
 * productos vendidos con su código, formas de pago y arqueo del efectivo.
 * Se lee por posición del texto porque las columnas del PDF parten los nombres en varias líneas.
 */

export type PdfText = { s: string; x: number; y: number };
export type PosCloseItem = { code: string; name: string; quantity: number; value: number };
export type PosClose = {
  number: number | null;
  date: string; // AAAA-MM-DD
  salesCount: number;
  total: number;
  payments: Record<string, number>; // "efectivo", "nequi", "tarjeta debito"…
  opening: number;
  countedCash: number | null; // valor ingresado por el cajero (arqueo)
  items: PosCloseItem[];
};

const toNum = (s: string) => Number(s.replace(/[^\d.-]/g, "")) || 0;
const strip = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Une las líneas de una celda: «VTL-FSS-» + «ALMEND-125G» → «VTL-FSS-ALMEND-125G»; lo demás con espacio. */
function joinCell(lines: string[]): string {
  return lines.reduce((acc, l) => (acc === "" ? l : acc.endsWith("-") ? acc + l : `${acc} ${l}`), "").replace(/\s+/g, " ").trim();
}

export function isPosClose(pages: PdfText[][]): boolean {
  return pages[0]?.some((i) => /Cierre de Caja No\./i.test(i.s)) ?? false;
}

export function parsePosClose(pages: PdfText[][]): PosClose | null {
  const first = pages[0] ?? [];
  const date = first.find((i) => /^\d{4}-\d{2}-\d{2}$/.test(i.s.trim()))?.s.trim();
  if (!date) return null;
  const number = Number(first.find((i) => /Cierre de Caja No\./i.test(i.s))?.s.match(/No\.\s*(\d+)/)?.[1]) || null;
  const salesCount = Number(first.find((i) => /^\d+$/.test(i.s.trim()) && first.some((j) => /Total:/.test(j.s) && Math.abs(j.y - i.y) < 3 && i.x > j.x))?.s) || 0;

  const items: PosCloseItem[] = [];
  const rest: { s: string; x: number; y: number; page: number }[] = [];
  let inProducts = false;
  let ended = false;
  for (const [pageNo, page] of pages.entries()) {
    const sorted = [...page].sort((a, b) => b.y - a.y || a.x - b.x);
    // 1) El texto de la tabla de productos, hasta el título «Formas de pago».
    const stopAt = sorted.find((i) => /^Formas de pago$/i.test(i.s.trim()));
    const inTable = ended ? [] : stopAt ? sorted.filter((i) => i.y > stopAt.y) : sorted;
    if (stopAt) ended = true;
    for (const i of sorted) if (ended && (!stopAt || i.y <= stopAt.y || pageNo > pages.findIndex((p) => p === page))) rest.push({ ...i, page: pageNo });
    const header = sorted.find((i) => /^C[oó]digo$/i.test(i.s.trim()));
    if (header) inProducts = true;
    if (!inProducts) continue;
    const top = header ? header.y : Infinity;
    // Fuera el encabezado y el pie que el navegador pone en cada página del PDF (fecha, «Vendty POS», enlace, «2/3»).
    const noise = (v: string) => /^(C[oó]digo|Ref|Cant|Precio|Productos|Vendty POS)$/i.test(v) || /^https?:\/\//i.test(v) || /^\d{1,2}\/\d{1,2}\/\d{2,4},/.test(v) || /^\d+\/\d+$/.test(v);
    const body = inTable.filter((i) => i.y < top && !noise(i.s.trim()));
    // Columnas según el encabezado (o las de la primera página si no se repite).
    const qtyX = pages[0].find((i) => /^Cant$/i.test(i.s.trim()))?.x ?? 329;
    const priceX = pages[0].find((i) => /^Precio$/i.test(i.s.trim()))?.x ?? 354;
    const refX = pages[0].find((i) => /^Ref$/i.test(i.s.trim()))?.x ?? 287;
    const isQty = (i: PdfText) => i.x >= qtyX - 8 && i.x < priceX - 2 && /^\d+(?:\.\d+)?$/.test(i.s.trim());
    const anchors = body.filter(isQty).flatMap((q) => {
      const price = body.find((p) => Math.abs(p.y - q.y) < 2 && p.x >= priceX - 4 && /^\d[\d,]*$/.test(p.s.trim()));
      return price ? [{ y: q.y, quantity: Number(q.s), value: toNum(price.s) }] : [];
    });
    if (anchors.length === 0) continue;
    const cells = anchors.map(() => ({ code: [] as { s: string; y: number }[], name: [] as { s: string; y: number }[] }));
    for (const i of body) {
      if (isQty(i) || i.x >= priceX - 4) continue;
      let best = 0;
      anchors.forEach((a, k) => { if (Math.abs(a.y - i.y) < Math.abs(anchors[best].y - i.y)) best = k; });
      if (Math.abs(anchors[best].y - i.y) > 11) continue; // texto de otra sección, no de esta fila
      (i.x < refX - 14 ? cells[best].code : cells[best].name).push({ s: i.s.trim(), y: i.y });
    }
    anchors.forEach((a, k) => {
      const order = (l: { s: string; y: number }[]) => l.sort((p, q) => q.y - p.y).map((x) => x.s);
      items.push({ code: joinCell(order(cells[k].code)), name: joinCell(order(cells[k].name)), quantity: a.quantity, value: a.value });
    });
  }

  // 2) Formas de pago, apertura y arqueo: se leen por líneas del texto que sigue a la tabla.
  const lines: string[] = [];
  const byRow = new Map<string, { x: number; s: string }[]>();
  for (const i of rest) {
    const key = `${i.page}:${Math.round(i.y)}`;
    byRow.set(key, [...(byRow.get(key) ?? []), { x: i.x, s: i.s }]);
  }
  for (const parts of byRow.values()) lines.push(parts.sort((a, b) => a.x - b.x).map((p) => p.s.trim()).join(" ").replace(/\s+/g, " "));
  const payments: Record<string, number> = {};
  let total = 0;
  let opening = 0;
  let countedCash: number | null = null;
  for (const l of lines) {
    const pay = l.match(/^(\d+)\s+(.+?)\s+\$\s*\(\+\)\s*([\d,]+(?:\.\d+)?)$/);
    if (pay) payments[strip(pay[2])] = (payments[strip(pay[2])] ?? 0) + toNum(pay[3]);
    const tot = l.match(/^Total\s+\$\s*([\d,]+(?:\.\d+)?)$/);
    if (tot && total === 0) total = toNum(tot[1]);
    const op = l.match(/\(\+\)\s*Total de apertura\s+\$\s*([\d,]+)/i);
    if (op) opening = toNum(op[1]);
    const count = l.match(/Valor ingresado por cajero\s+\$\s*([\d,]+)/i);
    if (count) countedCash = toNum(count[1]);
  }
  return { number, date, salesCount, total, payments, opening, countedCash, items };
}
