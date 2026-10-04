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
  role: text("role").notNull().default("admin"), // admin | cajera
  active: boolean("active").notNull().default(true),
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
    // Familia a la que pertenece esta presentación (Almendra → 125 g, 250 g, 500 g, 1 kg).
    familyId: integer("family_id"),
    format: text("format").notNull().default("bolsa"), // bolsa | papeleta | unidad
    // Inactiva solo porque se dio de baja su producto completo: vuelve al reactivarlo.
    pausedByFamily: boolean("paused_by_family").notNull().default(false),
  },
  (t) => [index("products_raw_idx").on(t.rawMaterialId), index("products_family_idx").on(t.familyId)],
);

// Producto "madre": nombre, categoría e IVA. Sus presentaciones (125 g, 250 g, papeleta…) son filas de products.
export const productFamilies = pgTable("product_families", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  category: text("category"),
  ivaRate: numeric("iva_rate", { precision: 5, scale: 4, mode: "number" }).notNull().default(0),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Receta de cada presentación: gramos de cada insumo que lleva una unidad.
// "Mixtura dulce 125 g" = 50 g maní salado + 43 g maní dulce + 30 g uvas pasas.
export const productComponents = pgTable(
  "product_components",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    rawMaterialId: integer("raw_material_id")
      .notNull()
      .references(() => rawMaterials.id),
    grams: qty("grams").notNull(),
  },
  (t) => [uniqueIndex("product_components_product_raw").on(t.productId, t.rawMaterialId), index("product_components_raw_idx").on(t.rawMaterialId)],
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
    kind: text("kind").notNull(), // entrada | empaque | ajuste | venta (a granel)
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

// Cuadre de caja: una jornada por día. Los montos de ventas incluyen IVA (lo que paga el cliente).
export const cashSessions = pgTable("cash_sessions", {
  id: serial("id").primaryKey(),
  businessDate: date("business_date", { mode: "string" }).notNull().unique(),
  status: text("status").notNull().default("abierta"), // abierta | cerrada
  openingCash: money("opening_cash").notNull().default(0),
  openedBy: integer("opened_by").references(() => users.id),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  salesCash: money("sales_cash").notNull().default(0),
  salesCard: money("sales_card").notNull().default(0),
  salesNequi: money("sales_nequi").notNull().default(0),
  salesDaviplata: money("sales_daviplata").notNull().default(0),
  salesTransfer: money("sales_transfer").notNull().default(0),
  salesOther: money("sales_other").notNull().default(0),
  countedCash: money("counted_cash"),
  denominations: text("denominations"), // JSON {"100000": 3, ...}
  nextBase: money("next_base"), // efectivo que queda en caja para el día siguiente
  closingNote: text("closing_note"),
  closedBy: integer("closed_by").references(() => users.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const cashMovements = pgTable("cash_movements", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => cashSessions.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // ingreso | egreso | retiro
  category: text("category").notNull(),
  amount: money("amount").notNull(), // siempre positivo; el tipo dice si suma o resta
  note: text("note"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Ventas a granel (por kilo o bulto) que salen directo del inventario sin empacarse.
export const bulkSales = pgTable("bulk_sales", {
  id: serial("id").primaryKey(),
  occurredOn: date("occurred_on", { mode: "string" }).notNull(),
  familyId: integer("family_id").notNull().references(() => productFamilies.id),
  kg: qty("kg").notNull(),
  totalGross: money("total_gross").notNull(), // lo que pagó el cliente, con IVA
  suggestedGross: money("suggested_gross").notNull(),
  customer: text("customer"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
