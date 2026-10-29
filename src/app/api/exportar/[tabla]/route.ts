import { asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  competitorPrices, competitors, expenses, productComponents, productFamilies, products, purchases, rawMaterials, saleLines, settings, supplierPayments, suppliers,
} from "@/db/schema";
import { loadComponents, loadRawCosts } from "@/lib/components";
import { unitCostFromComponents } from "@/lib/costing";
import { getSettings } from "@/lib/settings";
import { readSession } from "@/lib/session";

type Cell = string | number | boolean | null | undefined;

function csv(header: string[], rows: Cell[][]): string {
  const esc = (c: Cell) => {
    const t = c === null || c === undefined ? "" : String(c);
    return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

const TABLAS: Record<string, () => Promise<{ header: string[]; rows: Cell[][] }>> = {
  async productos() {
    const s = await getSettings();
    const comps = await loadComponents();
    const costs = await loadRawCosts();
    const fams = await db.select().from(productFamilies);
    const famName = new Map(fams.map((f) => [f.id, f.name]));
    const rows = await db.select().from(products).orderBy(asc(products.name));
    return {
      header: ["id", "sku", "producto", "familia", "categoria", "formato", "gramos", "activo", "iva", "precio_publico_con_iva", "costo_sin_iva", "margen_pct", "bolsas_listas"],
      rows: rows.map((p) => {
        const cost = unitCostFromComponents(p, (comps.get(p.id) ?? []).map((c) => ({ grams: c.grams, costPerKg: costs.get(c.rawMaterialId) ?? null })), s);
        const gross = Math.round(p.priceNet * (1 + p.ivaRate));
        return [p.id, p.sku, p.name, p.familyId ? famName.get(p.familyId) : "", p.category, p.format, p.grams, p.active, p.ivaRate, gross, cost === null ? "" : Math.round(cost),
          cost !== null && p.priceNet > 0 ? Math.round((1 - cost / p.priceNet) * 1000) / 10 : "", p.stockUnits];
      }),
    };
  },
  async insumos() {
    const rows = await db.select().from(rawMaterials).orderBy(asc(rawMaterials.name));
    return { header: ["id", "insumo", "categoria", "existencia_kg", "costo_por_kg", "minimo_kg", "activo"], rows: rows.map((r) => [r.id, r.name, r.category, r.stockGrams / 1000, Math.round(r.avgCostPerKg), r.minStockGrams / 1000, r.active]) };
  },
  async recetas() {
    const rows = await db
      .select({ producto: products.name, insumo: rawMaterials.name, gramos: productComponents.grams })
      .from(productComponents).innerJoin(products, eq(products.id, productComponents.productId)).innerJoin(rawMaterials, eq(rawMaterials.id, productComponents.rawMaterialId))
      .orderBy(asc(products.name));
    return { header: ["producto", "insumo", "gramos_por_unidad"], rows: rows.map((r) => [r.producto, r.insumo, r.gramos]) };
  },
  async proveedores() {
    const paid = db.select({ purchaseId: supplierPayments.purchaseId, paid: sql<number>`sum(${supplierPayments.amount})`.as("paid") }).from(supplierPayments).groupBy(supplierPayments.purchaseId).as("p");
    const rows = await db
      .select({ id: purchases.id, proveedor: suppliers.name, nit: suppliers.nit, numero: purchases.invoiceNumber, fecha: purchases.issueDate, vence: purchases.dueDate, total: purchases.total, pagado: paid.paid, estado: purchases.status, forma: purchases.paymentTerm })
      .from(purchases).leftJoin(suppliers, eq(suppliers.id, purchases.supplierId)).leftJoin(paid, eq(paid.purchaseId, purchases.id)).orderBy(desc(purchases.issueDate));
    return { header: ["compra_id", "proveedor", "nit", "factura", "fecha", "vence", "total", "pagado", "saldo", "estado_inventario", "forma_pago"], rows: rows.map((r) => [r.id, r.proveedor, r.nit, r.numero, r.fecha, r.vence, r.total, Number(r.pagado ?? 0), r.total - Number(r.pagado ?? 0), r.estado, r.forma]) };
  },
  async ventas_mensuales() {
    const rows = await db
      .select({
        mes: sql<string>`to_char(${saleLines.soldAt} at time zone 'America/Bogota', 'YYYY-MM')`,
        producto: saleLines.productName, unidades: sql<number>`sum(${saleLines.quantity})`, ventas: sql<number>`sum(${saleLines.total})`,
        costo: sql<number>`sum(${saleLines.unitCostNet} * ${saleLines.quantity})`,
      })
      .from(saleLines).where(eq(saleLines.excluded, false))
      .groupBy(sql`1`, saleLines.productName).orderBy(sql`1`, saleLines.productName);
    return { header: ["mes", "producto", "unidades", "ventas_con_iva", "costo_sin_iva"], rows: rows.map((r) => [r.mes, r.producto, Number(r.unidades), Math.round(Number(r.ventas)), Math.round(Number(r.costo))]) };
  },
  async competencia() {
    const rows = await db
      .select({ comp: competitors.name, nombre: competitorPrices.rawName, gramos: competitorPrices.grams, precio: competitorPrices.priceGross, fecha: competitorPrices.capturedOn, nuestro: products.name })
      .from(competitorPrices).innerJoin(competitors, eq(competitors.id, competitorPrices.competitorId)).leftJoin(products, eq(products.id, competitorPrices.productId)).orderBy(asc(competitorPrices.rawName));
    return { header: ["competidor", "producto_competidor", "gramos", "precio_con_iva", "fecha", "producto_vitalic_equivalente"], rows: rows.map((r) => [r.comp, r.nombre, r.gramos, r.precio, r.fecha, r.nuestro]) };
  },
  async gastos() {
    const rows = await db.select().from(expenses).orderBy(desc(expenses.month));
    return { header: ["mes", "categoria", "monto", "nota"], rows: rows.map((r) => [r.month, r.category, r.amount, r.note]) };
  },
  async ajustes() {
    const rows = await db.select().from(settings).orderBy(asc(settings.key));
    return { header: ["clave", "valor"], rows: rows.map((r) => [r.key, r.value]) };
  },
};

/** Descarga de datos en CSV (solo administrador), para analizarlos en otras herramientas. */
export async function GET(_req: Request, { params }: { params: Promise<{ tabla: string }> }) {
  const session = await readSession();
  if (!session || session.role !== "admin") return new Response("No autorizado", { status: 401 });
  const { tabla } = await params;
  const name = tabla.replace(/\.csv$/, "");
  const build = TABLAS[name];
  if (!build) return new Response(`Tablas: ${Object.keys(TABLAS).join(", ")}`, { status: 404 });
  const { header, rows } = await build();
  return new Response(csv(header, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="vitalic-${name}.csv"` } });
}
