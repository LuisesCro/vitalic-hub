import "server-only";
import { and, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchaseLines, purchases, quoteItems, quotes, rawMaterials, restockRequests } from "@/db/schema";
import { planAutoOrder, type Need, type OpenState } from "@/lib/auto-order";
import { loadComponents } from "@/lib/components";
import { todayISO } from "@/lib/format";
import { rawMaterialConsumption, trackedRawMaterialIds } from "@/lib/reports";
import { stockAlerts } from "@/lib/stock-alerts";
import { lastKgPrices } from "@/lib/supplier-prices";

/** Una cotización generada bloquea volver a pedir el insumo hasta que llegue la compra, como mucho estos días. */
const EN_CAMINO_DIAS = 21;
/** Lo que Luis quitó del pedido automático no vuelve a aparecer durante estos días. */
const DESCARTADO_DIAS = 14;
/** «Ya lo pedí» en Lo que se acaba bloquea el pedido automático estos días. */
const PEDIDO_DIAS = 10;

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

/**
 * Arma (o actualiza) solo el pedido por proveedor con todo lo que se está acabando.
 * Los renglones automáticos son los que no tienen `createdBy`; si alguien los edita pasan a ser suyos
 * y el HUB ya no los toca. Devuelve los insumos que se acaban pero no tienen ningún precio de proveedor.
 */
export async function syncAutoOrder(): Promise<{ noSupplier: Need[] }> {
  const [alerts, urgent, recipes, tracked, consumption, materials] = await Promise.all([
    stockAlerts({ insumos: true }),
    db.select().from(restockRequests).where(eq(restockRequests.status, "pendiente")),
    loadComponents(),
    trackedRawMaterialIds(),
    rawMaterialConsumption(90),
    db.select({ id: rawMaterials.id, name: rawMaterials.name, stockGrams: rawMaterials.stockGrams }).from(rawMaterials),
  ]);
  const material = new Map(materials.map((m) => [m.id, m]));
  const rawOf = (kind: string, id: number): number | null => {
    if (kind === "insumo") return id;
    const comps = recipes.get(id) ?? [];
    return comps.length === 1 ? comps[0].rawMaterialId : null;
  };
  const stockKgOf = (raw: number) => (tracked.has(raw) ? Math.max(0, (material.get(raw)?.stockGrams ?? 0) / 1000) : 0);
  const needOf = (raw: number, reason: Need["reason"]): Need | null => {
    const m = material.get(raw);
    return m ? { rawMaterialId: raw, name: m.name, stockKg: stockKgOf(raw), reason } : null;
  };

  const needs: Need[] = [];
  // 1) Lo que la cajera marcó urgente, aunque el inventario no lo muestre bajo.
  for (const r of urgent) {
    const raw = rawOf(r.kind, r.refId);
    const n = raw ? needOf(raw, "urgente") : null;
    if (n) needs.push(n);
  }
  // 2) Insumos que se acaban.
  for (const a of alerts) if (a.kind === "insumo") { const n = needOf(a.id, a.level); if (n) needs.push(n); }
  // 3) Bolsas que se acaban y cuyo insumo no lleva inventario propio (si lo lleva, basta con empacar).
  for (const a of alerts) {
    if (a.kind !== "bolsa") continue;
    const raw = rawOf("bolsa", a.id);
    if (raw && !tracked.has(raw)) { const n = needOf(raw, a.level); if (n) needs.push(n); }
  }
  const raws = [...new Set(needs.map((n) => n.rawMaterialId))];

  // Lo que ya está abierto para cada insumo.
  const [drafts, cotizados, descartados, pedidos] = await Promise.all([
    db.select().from(quoteItems).where(and(eq(quoteItems.status, "borrador"), isNull(quoteItems.quoteId))),
    raws.length
      ? db.select({ raw: quoteItems.rawMaterialId, createdAt: quotes.createdAt }).from(quoteItems)
          .innerJoin(quotes, eq(quotes.id, quoteItems.quoteId))
          .where(and(inArray(quoteItems.rawMaterialId, raws), gte(quotes.createdAt, daysAgo(EN_CAMINO_DIAS))))
      : [],
    db.select({ raw: quoteItems.rawMaterialId }).from(quoteItems)
      .where(and(eq(quoteItems.status, "descartada"), gte(quoteItems.createdAt, daysAgo(DESCARTADO_DIAS)))),
    db.select().from(restockRequests).where(and(eq(restockRequests.status, "pedido"), isNotNull(restockRequests.orderedAt), gte(restockRequests.orderedAt, daysAgo(PEDIDO_DIAS)))),
  ]);
  const lastPurchase = new Map<number, string>();
  if (raws.length) {
    const rows = await db
      .select({ raw: purchaseLines.rawMaterialId, date: sql<string>`max(${purchases.issueDate})` })
      .from(purchaseLines).innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
      .where(inArray(purchaseLines.rawMaterialId, raws)).groupBy(purchaseLines.rawMaterialId);
    for (const r of rows) if (r.raw && r.date) lastPurchase.set(r.raw, String(r.date));
  }
  const bogota = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const open = new Map<number, OpenState>();
  const state = (raw: number): OpenState => {
    const s = open.get(raw) ?? { manualDraft: false, inFlight: false, dismissed: false, orderedRecently: false };
    open.set(raw, s);
    return s;
  };
  for (const d of drafts) if (d.rawMaterialId && d.createdBy !== null) state(d.rawMaterialId).manualDraft = true;
  for (const c of cotizados) {
    if (!c.raw) continue;
    const arrived = lastPurchase.get(c.raw);
    if (!arrived || arrived < bogota(c.createdAt)) state(c.raw).inFlight = true;
  }
  for (const d of descartados) if (d.raw) state(d.raw).dismissed = true;
  for (const r of pedidos) { const raw = rawOf(r.kind, r.refId); if (raw) state(raw).orderedRecently = true; }

  const prices = await lastKgPrices(raws);
  const plan = planAutoOrder(needs, prices, consumption, open, todayISO());
  const wanted = new Map(plan.lines.map((l) => [l.rawMaterialId, l]));

  await db.transaction(async (tx) => {
    // Un solo armado a la vez aunque se abran dos pantallas al mismo tiempo.
    await tx.execute(sql`select pg_advisory_xact_lock(724501)`);
    const autos = await tx.select().from(quoteItems).where(and(eq(quoteItems.status, "borrador"), isNull(quoteItems.quoteId), isNull(quoteItems.createdBy)));
    const kept = new Set<number>();
    for (const it of autos) {
      const w = it.rawMaterialId ? wanted.get(it.rawMaterialId) : undefined;
      if (!w || kept.has(w.rawMaterialId)) {
        await tx.delete(quoteItems).where(eq(quoteItems.id, it.id));
        continue;
      }
      kept.add(w.rawMaterialId);
      if (it.supplierId !== w.supplierId || it.qtyKg !== w.qtyKg || it.name !== w.name) {
        await tx.update(quoteItems).set({ supplierId: w.supplierId, qtyKg: w.qtyKg, name: w.name }).where(eq(quoteItems.id, it.id));
      }
    }
    const fresh = plan.lines.filter((l) => !kept.has(l.rawMaterialId));
    if (fresh.length) await tx.insert(quoteItems).values(fresh.map((l) => ({ supplierId: l.supplierId, rawMaterialId: l.rawMaterialId, name: l.name, qtyKg: l.qtyKg, createdBy: null })));
  });

  return { noSupplier: plan.noSupplier };
}
