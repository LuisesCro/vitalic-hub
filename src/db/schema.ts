import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// Montos en pesos colombianos sin IVA salvo que el nombre diga lo contrario.
// Cantidades de materia prima en gramos.
const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
const qty = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const suppliers = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nit: text("nit").unique(),
  phone: text("phone"),
  notes: text("notes"),
});

// Insumos: materia prima a granel que se reempaca (almendra, canela, etc.).
export const rawMaterials = pgTable("raw_materials", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  vendtyCode: text("vendty_code").unique(),
  category: text("category"),
  stockGrams: qty("stock_grams").notNull().default(0),
  avgCostPerKg: money("avg_cost_per_kg").notNull().default(0),
  minStockGrams: qty("min_stock_grams").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

// Productos de venta (bolsas por presentación).
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    sku: text("sku").notNull().unique(),
    name: text("name").notNull(),
    category: text("category"),
    grams: qty("grams"),
    rawMaterialId: integer("raw_material_id").references(() => rawMaterials.id),
    priceNet: money("price_net").notNull().default(0),
    ivaRate: numeric("iva_rate", { precision: 5, scale: 4, mode: "number" }).notNull().default(0),
    vendtyCost: money("vendty_cost"),
    packagingCost: money("packaging_cost").notNull().default(0),
    active: boolean("active").notNull().default(true),
  },
  (t) => [index("products_raw_idx").on(t.rawMaterialId)],
);

export const purchases = pgTable("purchases", {
  id: serial("id").primaryKey(),
  supplierId: integer("supplier_id").references(() => suppliers.id),
  invoiceNumber: text("invoice_number"),
  cufe: text("cufe").unique(),
  issueDate: date("issue_date", { mode: "string" }),
  subtotal: money("subtotal").notNull().default(0),
  tax: money("tax").notNull().default(0),
  total: money("total").notNull().default(0),
  source: text("source").notNull(), // xml | foto | manual
  status: text("status").notNull().default("borrador"), // borrador | confirmada
  rawXml: text("raw_xml"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
});

export const purchaseLines = pgTable("purchase_lines", {
  id: serial("id").primaryKey(),
  purchaseId: integer("purchase_id")
    .notNull()
    .references(() => purchases.id, { onDelete: "cascade" }),
  supplierCode: text("supplier_code"),
  description: text("description").notNull(),
  quantity: qty("quantity").notNull(),
  unit: text("unit"),
  unitPrice: money("unit_price").notNull().default(0),
  lineTotal: money("line_total").notNull().default(0),
  taxRate: numeric("tax_rate", { precision: 5, scale: 4, mode: "number" }).notNull().default(0),
  rawMaterialId: integer("raw_material_id").references(() => rawMaterials.id),
  // Kilos que representa una unidad de la línea (p. ej. una caja = 11,34 kg).
  kgPerUnit: qty("kg_per_unit"),
});

// Lo que la plataforma aprende: "ALMENDRA NONPAREIL 22,68KG" de 3A = insumo Almendra, 22,68 kg por unidad.
export const supplierItemMap = pgTable(
  "supplier_item_map",
  {
    id: serial("id").primaryKey(),
    supplierId: integer("supplier_id").references(() => suppliers.id),
    matchKey: text("match_key").notNull(),
    rawMaterialId: integer("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    kgPerUnit: qty("kg_per_unit").notNull(),
  },
  (t) => [uniqueIndex("supplier_item_map_key").on(t.supplierId, t.matchKey)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    rawMaterialId: integer("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    kind: text("kind").notNull(), // entrada | empaque | ajuste
    grams: qty("grams").notNull(), // positivo entra, negativo sale
    costPerKg: money("cost_per_kg"),
    purchaseLineId: integer("purchase_line_id").references(() => purchaseLines.id),
    packagingRunId: integer("packaging_run_id"),
    note: text("note"),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("stock_movements_raw_idx").on(t.rawMaterialId)],
);

export const packagingRuns = pgTable("packaging_runs", {
  id: serial("id").primaryKey(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id),
  bags: integer("bags").notNull(),
  gramsUsed: qty("grams_used").notNull(),
  wasteGrams: qty("waste_grams").notNull().default(0),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Líneas de venta importadas de Vendty (exportación "Transacciones").
export const saleLines = pgTable(
  "sale_lines",
  {
    id: serial("id").primaryKey(),
    externalKey: text("external_key").notNull().unique(),
    invoice: text("invoice").notNull(),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull(),
    sku: text("sku").notNull(),
    productName: text("product_name").notNull(),
    category: text("category"),
    quantity: qty("quantity").notNull(),
    unitPriceNet: money("unit_price_net").notNull(),
    unitCostNet: money("unit_cost_net").notNull(),
    subtotalNet: money("subtotal_net").notNull(),
    tax: money("tax").notNull(),
    total: money("total").notNull(),
    paymentMethod: text("payment_method"),
    excluded: boolean("excluded").notNull().default(false),
    excludedReason: text("excluded_reason"),
  },
  (t) => [index("sale_lines_sold_at_idx").on(t.soldAt), index("sale_lines_sku_idx").on(t.sku)],
);

export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  month: date("month", { mode: "string" }).notNull(), // primer día del mes
  category: text("category").notNull(),
  amount: money("amount").notNull(),
  note: text("note"),
});

export const competitors = pgTable("competitors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const competitorPrices = pgTable(
  "competitor_prices",
  {
    id: serial("id").primaryKey(),
    competitorId: integer("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => products.id),
    rawName: text("raw_name").notNull(),
    grams: qty("grams"),
    priceGross: money("price_gross").notNull(), // precio al público, con IVA
    capturedOn: date("captured_on", { mode: "string" }).notNull(),
  },
  (t) => [index("competitor_prices_product_idx").on(t.productId)],
);

// Parámetros editables: márgenes objetivo, posición competitiva, redondeo.
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
