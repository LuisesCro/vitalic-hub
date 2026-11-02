import "server-only";
import { eq, ilike } from "drizzle-orm";
import { db } from "./index";
import { rawMaterials, supplierPrices, suppliers } from "./schema";
import { normalize } from "@/lib/units";

/**
 * Factura 008429 de Multisoluciones Insalpro (30 de octubre de 2025): se usa solo como referencia de precios
 * mientras no haya compras más recientes. Cada línea: descripción, cantidad, precio por unidad, kilos que trae la
 * unidad (null si no se vende por peso) e insumo del HUB al que corresponde. Suma exacta de la factura: $15.248.700.
 */
const SOURCE = "ref-008429";
const DATE = "2025-10-30";

type Row = [description: string, qty: number, unitPrice: number, kg: number | null, raw: string | null];
const ROWS: Row[] = [
  ["ACEITE DE OLIVA ANDALUZ 500 ML", 6, 28000, null, "Aceite de Oliva - extra virgen ANDALUZ"],
  ["ACEITE DE OLIVA PURO ANDALUZ X 1 LT", 6, 50000, null, "Aceite de Oliva - extra virgen ANDALUZ"],
  ["ACEITE DE COCO X 250 ML", 6, 17000, null, "Aceite de Coco"],
  ["ACEITE DE COCO X 500 ML", 6, 28000, null, "Aceite de Coco"],
  ["ACEITE DE COCO X 1 LT", 6, 52000, null, "Aceite de Coco"],
  ["CLAVO ENTERO X 1 KL", 10, 49000, 1, "Clavos enteros"],
  ["COLOR IMPORTADO X 500 G", 6, 2200, 0.5, "Color naranjado"],
  ["COLOR IMPORTADO @ X 25 LB EMP", 1, 45000, 12.5, "Color naranjado"],
  ["COLOR IMPORTADO @ X 25 LB EMP", 1, 45000, 12.5, "Color naranjado"],
  ["COLOR IMPORTADO X 500 G", 6, 2200, 0.5, "Color naranjado"],
  ["SAL DE AJO @ X 12.5 KL", 1, 65000, 12.5, "Sal de ajo"],
  ["ACHIOTE PEPA X 500 G", 5, 11000, 0.5, "Achiote en grano"],
  ["ABLANDACARNES X 500 G", 5, 4500, 0.5, "Ablanda carne"],
  ["CANELA ASTILLA CAJA X 10 KL", 1, 790000, 10, "Canela entera"],
  ["FRIJOL MONGO X 1 KL", 25, 6500, 1, "Frijol Mongo"],
  ["BICARBONATO BULTO X 25 KL", 1, 55000, 25, "Bicarbonato"],
  ["GELATINA SIN SABOR BULTO X 25 KL", 1, 800000, 25, "Gelatina sin sabor"],
  ["GLUTAMATO AGUJA BULTO X 25 KL", 1, 200000, 25, "Glutamato"],
  ["SAL DEL HIMALAYA FINA X 500 G", 6, 7000, 0.5, "Sal Himalaya delgada"],
  ["SAL MARINA FINA X 250 G", 6, 4000, 0.25, "Sal Marina delgada"],
  ["SAL MARINA FINA X 500 G", 6, 2300, 0.5, "Sal Marina delgada"],
  ["ACHIOTE MOLIDO BULTO X 25 KL", 1, 450000, 25, "Achiote molido"],
  ["UVAS PASAS CHILENA CAJA X 10 KL", 1, 105000, 10, "Uvas pasas"],
  ["ARANDANOS CAJA X 11.3 KL", 1, 300000, 11.3, "Arandanos deshidratados"],
  ["CIRUELAS CAJA X 10 KL", 1, 190000, 10, "Ciruela pasa"],
  ["FRUTA CRISTALIZADA X 250 G", 6, 4000, 0.25, "Fruta Cristalizada"],
  ["FRUTA CRISTALIZADA X 500 G", 6, 7000, 0.5, "Fruta Cristalizada"],
  ["AROS FRUTALES X 500 G", 6, 4500, 0.5, "Cereales anillos frutales"],
  ["CHOCO ARROZ X 500 G", 6, 4500, 0.5, null],
  ["HOJUELA AZUCARADA X 500 G", 6, 4500, 0.5, null],
  ["ALMENDRAS LAMINADAS S.P CAJA X 11.3 KL", 1, 540000, 11.3, "Almendra Laminada"],
  ["NUEZ DEL BRASIL CAJA X 20 KL", 1, 1350000, 20, "Nuez del Brasil"],
  ["PISTACHO CAJA X 10 KL", 1, 650000, 10, "Pistacho"],
  ["MARAÑON N CAJA X 22.7 KL", 1, 1280000, 22.7, "Marañon"],
  ["MACADAMIA BULTO X 10 KL", 1, 720000, 10, "Nuez de macadamia"],
  ["SEMILLA DE CALABAZA BULTO X 25 KL", 1, 850000, 25, "Semilla de Calabaza"],
  ["CHIA SEMILLA BULTO X 25 KL", 1, 450000, 25, "Semilla de chia"],
  ["GIRASOL SEMILLA DESC. BULTO X 25 KL", 1, 320000, 25, "Semilla de girasol"],
  ["LINAZA GRANO BULTO X 25 KL", 1, 153000, 25, "Linaza"],
  ["QUINUA SEMILLA X 1 KL", 12, 13000, 1, "Quinua"],
  ["AMARANTO GRANO X 1 KL", 3, 13000, 1, "Amaranto en grano"],
  ["SOYA FRIJOL X 1 KL", 10, 5800, 1, "Soya pepa"],
  ["MANI DULCE SIN 250 G", 12, 3500, 0.25, "Mani dulce"],
  ["MANI DULCE SIN 500 G", 12, 6300, 0.5, "Mani dulce"],
  ["MANI SALADO X 250 G", 12, 3800, 0.25, "Mani salado"],
  ["MANI SALADO X 500 G", 12, 6800, 0.5, "Mani salado"],
  ["MANI SIMPLE X 250 G", 12, 3800, 0.25, "Mani simple"],
  ["MANI SIMPLE X 500 G", 12, 6800, 0.5, "Mani simple"],
  ["MANI MIXTURA DULCE X 250 G", 12, 3800, 0.25, "Mani mixtura"],
  ["MANI MIXTURA DULCE X 500 G", 12, 6800, 0.5, "Mani mixtura"],
  ["MANI MIX ESPECIAL X 250 G", 6, 5500, 0.25, "Mani mixtura especial"],
  ["MANI MIX ESPECIAL X 500 G", 6, 11000, 0.5, "Mani mixtura especial"],
  ["MANI TRITURADO X 250 G", 12, 3800, 0.25, "Mani Triturado"],
  ["MANI TRITURADO X 500 G", 12, 6800, 0.5, "Mani Triturado"],
  ["MANI SIN PIEL X 250 G", 12, 3300, 0.25, "Mani sin piel"],
  ["MANI SIN PIEL X 500 G", 12, 5800, 0.5, "Mani sin piel"],
  ["AVENA HOJUELA X 250 G", 6, 2000, 0.25, "Avena en hojuelas"],
  ["AVENA HOJUELA X 500 G", 6, 3300, 0.5, "Avena en hojuelas"],
  ["AMAPOLA SEMILLA X 1 KL", 10, 52000, 1, "Semilla de amapola"],
  ["CEBADA MOLIDA X 250 G", 6, 2500, 0.25, "Cebada molida"],
  ["CEBADA MOLIDA X 500 G", 6, 3300, 0.5, "Cebada molida"],
  ["TRIGO HARINA INTEGRAL X 250 G", 6, 1900, 0.25, "Harina de trigo integral"],
  ["TRIGO HARINA INTEGRAL X 500 G", 6, 2700, 0.5, "Harina de trigo integral"],
  ["HARINA DE ARROZ X 500 G", 6, 2800, 0.5, "Harina de arroz"],
  ["MOSTAZA NEGRA GRANO X 500 G", 3, 4500, 0.5, "Mostaza negra"],
  ["HARINA DE ALMENDRAS S P X 500 G", 6, 26000, 0.5, "Harina de almendras"],
  ["AVENA MOLIDA X 500 G", 6, 3400, 0.5, null],
  ["GRANOLA FRUIT IS LIFE X 950 G", 6, 12500, 0.95, null],
  ["GRANOLA FRUIT IS LIFE X 450 G", 6, 7000, 0.45, null],
  ["GRANOLA FRUIT IS LIFE X 950 G", 6, 12500, 0.95, null],
  ["GRANOLA FRUIT IS LIFE X 450 G", 6, 8000, 0.45, null],
  ["COLAGENO HIDROLIZADO X 250 G", 6, 17000, 0.25, null],
  ["COLAGENO HIDROLIZADO X 500 G", 6, 32000, 0.5, null],
  ["BOLSAS PP 6X10 X 100 UND", 50, 6000, null, null],
  ["BOLSAS PP 3X6 X 500 UND", 10, 9000, null, null],
  ["BOLSAS PP 5X8 X 100 UND", 50, 4500, null, null],
  ["ALMENDRAS ENTERAS X 1 KL", 20, 40000, 1, "Almendra"],
];

/** Carga una sola vez los precios de referencia de Insalpro. Si el proveedor no existe o ya se cargó, no hace nada. */
export async function loadReferencePrices(): Promise<void> {
  const [supplier] = await db.select({ id: suppliers.id }).from(suppliers).where(ilike(suppliers.name, "%insalpro%")).limit(1);
  if (!supplier) return;
  const done = await db.select({ id: supplierPrices.id }).from(supplierPrices).where(eq(supplierPrices.source, SOURCE)).limit(1);
  if (done.length) return;
  const materials = await db.select({ id: rawMaterials.id, name: rawMaterials.name }).from(rawMaterials);
  const byName = new Map(materials.map((m) => [normalize(m.name), m.id]));
  await db.insert(supplierPrices).values(
    ROWS.map(([description, , unitPrice, kg, raw]) => ({
      supplierId: supplier.id,
      rawMaterialId: raw ? byName.get(normalize(raw)) ?? null : null,
      description,
      unitPrice,
      packKg: kg,
      pricePerKg: kg ? Math.round(unitPrice / kg) : null,
      priceDate: DATE,
      source: SOURCE,
    })),
  );
}

export const REFERENCE_TOTAL = ROWS.reduce((t, r) => t + r[1] * r[2], 0);
