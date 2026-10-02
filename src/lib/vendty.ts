import * as XLSX from "xlsx";

/** Lectores de las exportaciones de Vendty (Excel). */

type Row = Record<string, unknown>;

function readRows(bytes: Uint8Array): Row[] {
  const book = XLSX.read(bytes, { type: "array", cellDates: false });
  const sheet = book.Sheets[book.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true });
}

function str(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).replace(/\s+/g, " ").trim();
}

/** Convierte "1,371,691" o 1371691 a número. */
export function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const text = str(value).replace(/[$\s]/g, "").replace(/,/g, "");
  const n = Number(text);
  return Number.isFinite(n) ? n : 0;
}

export type VendtyProduct = {
  sku: string;
  name: string;
  category: string;
  costNet: number | null;
  priceNet: number | null;
  ivaRate: number;
  isIngredient: boolean;
};

/** Exportación "Productos" (productos.xls). */
export function parseVendtyProducts(bytes: Uint8Array): VendtyProduct[] {
  return readRows(bytes)
    .filter((r) => str(r["Codigo del producto"]))
    .map((r) => {
      const sku = str(r["Codigo del producto"]);
      const category = str(r["Categoria"]);
      const cost = toNumber(r["Precio de compra"]);
      const price = toNumber(r["Precio de venta"]);
      return {
        sku,
        name: str(r["Nombre del producto"]),
        category,
        costNet: cost > 0 ? cost : null,
        priceNet: price > 0 ? price : null,
        ivaRate: str(r["Nombre del impuesto"]).toUpperCase().includes("19") ? 0.19 : 0,
        isIngredient: category.toLowerCase() === "ingredientes" || /^ing\s?\d/i.test(sku),
      };
    });
}

export type VendtySaleLine = {
  externalKey: string;
  invoice: string;
  soldAt: Date;
  sku: string;
  productName: string;
  category: string | null;
  quantity: number;
  unitPriceNet: number;
  unitCostNet: number;
  subtotalNet: number;
  tax: number;
  total: number;
  paymentMethod: string | null;
  excluded: boolean;
  excludedReason: string | null;
};

/**
 * Exportación "Exportar facturas (Transacciones)". Marca como excluidas las
 * líneas que no son ventas reales (cantidades enormes a $0, típicas de ajustes
 * de inventario registrados como venta).
 */
export function parseVendtyTransactions(bytes: Uint8Array): VendtySaleLine[] {
  const rows = readRows(bytes).filter((r) => str(r["Código Producto"]) && str(r["Fecha"]));
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const invoice = str(r["# Factura"]);
    const sku = str(r["Código Producto"]);
    const base = `${invoice}|${sku}|${str(r["Fecha"])}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const quantity = toNumber(r["Cantidad"]) - toNumber(r["Cant. Devueltas"]);
    const unitPriceNet = toNumber(r["Precio Venta"]);
    let excluded = false;
    let excludedReason: string | null = null;
    if (unitPriceNet === 0 && quantity >= 1000) {
      excluded = true;
      excludedReason = "Cantidad muy alta a $0: parece un ajuste de inventario";
    }
    return {
      externalKey: `${base}|${n}`,
      invoice,
      soldAt: new Date(str(r["Fecha"]).replace(" ", "T") + "-05:00"),
      sku,
      productName: str(r["Detalle Producto"]),
      category: str(r["Categoría"]) || null,
      quantity,
      unitPriceNet,
      unitCostNet: toNumber(r["Precio Compra"]),
      subtotalNet: toNumber(r["Subtotal"]),
      tax: toNumber(r["Impuesto Total"]),
      total: toNumber(r["Total Venta"]),
      paymentMethod: str(r["Forma Pago"]) || null,
      excluded,
      excludedReason,
    };
  });
}

/** Un costo unitario mayor al doble del precio casi siempre es un error de carga (costo por kilo o por bulto). */
export function isSuspiciousCost(unitPriceNet: number, unitCostNet: number): boolean {
  return unitPriceNet > 0 && unitCostNet > unitPriceNet * 2;
}
