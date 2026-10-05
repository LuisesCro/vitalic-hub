import { requireAdmin } from "@/lib/session";
import { asc, eq, inArray } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { purchaseLines, purchases, rawMaterials, stockMovements, supplierPayments, suppliers, users } from "@/db/schema";
import { fmtCOP, fmtNum, todayISO } from "@/lib/format";
import { PAYMENT_METHODS_SUPPLIER, daysUntil, payStatus, type SupplierPaymentMethod } from "@/lib/payables";
import { PayForm } from "../pay-form";
import { deleteSupplierPayment, updatePaymentTerms } from "../payments";
import { PayBadge } from "../status-badge";
import { completePurchaseLines, confirmPurchase, deleteDraft, saveDraft } from "../actions";

export default async function CompraPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ falta?: string }> }) {
  await requireAdmin();
  const id = Number((await params).id);
  const falta = Number((await searchParams).falta ?? 0);
  if (!Number.isInteger(id)) notFound();
  const [purchase] = await db
    .select({ p: purchases, supplier: suppliers.name })
    .from(purchases)
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .where(eq(purchases.id, id));
  if (!purchase) notFound();
  const p = purchase.p;
  const lines = await db.select().from(purchaseLines).where(eq(purchaseLines.purchaseId, id)).orderBy(asc(purchaseLines.id));
  const materials = await db.select({ id: rawMaterials.id, name: rawMaterials.name }).from(rawMaterials).orderBy(asc(rawMaterials.name));
  // Líneas de una factura confirmada que sí sumaron al inventario (las demás se pueden completar).
  const entered = new Set(
    lines.length
      ? (await db.select({ id: stockMovements.purchaseLineId }).from(stockMovements).where(inArray(stockMovements.purchaseLineId, lines.map((l) => l.id)))).map((m) => m.id)
      : [],
  );
  const locked = p.status === "confirmada";
  const payments = await db
    .select({ pay: supplierPayments, by: users.name })
    .from(supplierPayments)
    .leftJoin(users, eq(supplierPayments.createdBy, users.id))
    .where(eq(supplierPayments.purchaseId, id))
    .orderBy(asc(supplierPayments.paidOn), asc(supplierPayments.id));
  const today = todayISO();
  const paid = payments.reduce((t, x) => t + x.pay.amount, 0);
  const pay = payStatus(p.total, paid, p.dueDate, today);
  const due = daysUntil(p.dueDate, today);
  const linesTotal = lines.reduce((s, l) => s + l.lineTotal, 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Compra #{p.id}: {purchase.supplier ?? "Proveedor sin identificar"}</h1>
        <p className="text-sm text-muted">
          Factura {p.invoiceNumber ?? "—"} · Subtotal {fmtCOP(p.subtotal)} · IVA {fmtCOP(p.tax)} · Total {fmtCOP(p.total)}
          {p.source === "foto" && " · Leída de una foto: revisa cantidades y precios"}
        </p>
        {Math.abs(linesTotal - p.subtotal) > 1000 && p.subtotal > 0 && (
          <p className="text-sm text-amber-600">
            La suma de las líneas ({fmtCOP(linesTotal)}) no coincide con el subtotal de la factura. Revisa las cantidades.
          </p>
        )}
      </div>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Pago al proveedor</h2>
          <PayBadge status={pay.status} daysOverdue={pay.daysOverdue} />
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div><p className="label">Total factura</p><p className="font-semibold">{fmtCOP(p.total)}</p></div>
          <div><p className="label">Pagado</p><p className="font-semibold">{fmtCOP(paid)}</p></div>
          <div><p className="label">Saldo</p><p className="font-semibold" style={{ color: pay.balance > 0 ? "var(--bad)" : "var(--good)" }}>{fmtCOP(pay.balance)}</p></div>
        </div>
        <form action={updatePaymentTerms} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="purchaseId" value={p.id} />
          <label>
            <span className="label">Forma de pago</span>
            <select name="paymentTerm" defaultValue={p.paymentTerm ?? ""} className="input">
              <option value="">Sin definir</option>
              <option value="contado">Contado</option>
              <option value="credito">Crédito</option>
            </select>
          </label>
          <label>
            <span className="label">Vence</span>
            <input type="date" name="dueDate" defaultValue={p.dueDate ?? ""} className="input" />
          </label>
          <button className="btn-secondary">Guardar</button>
          {pay.balance > 0 && due !== null && (
            <span className="text-sm" style={{ color: due < 0 ? "var(--bad)" : due <= 7 ? "var(--warn)" : "var(--muted)" }}>
              {due < 0 ? `Vencida hace ${-due} días` : due === 0 ? "Vence hoy" : `Vence en ${due} días`}
            </span>
          )}
        </form>
        {payments.length > 0 && (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {payments.map(({ pay: x, by }) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  <strong>{fmtCOP(x.amount)}</strong> · {PAYMENT_METHODS_SUPPLIER[x.method as SupplierPaymentMethod] ?? x.method} · {x.paidOn}
                  <span className="text-muted">{[x.note, by, x.cashMovementId ? "desde la caja" : null].filter(Boolean).map((t) => ` · ${t}`).join("")}</span>
                </span>
                <form action={deleteSupplierPayment}>
                  <input type="hidden" name="id" value={x.id} />
                  <button className="text-xs text-muted underline">Borrar</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <PayForm purchaseId={p.id} balance={pay.balance} today={today} />
      </section>

      <form className="space-y-4">
        <input type="hidden" name="purchaseId" value={p.id} />
        <h2 className="font-semibold">Productos e inventario</h2>
        {falta > 0 && (
          <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bad-bg)", color: "var(--bad)" }}>
            No se confirmó: {falta === 1 ? "hay 1 producto" : `hay ${falta} productos`} del inventario sin peso (marcados en rojo). Escribe los kg por unidad, o elige «No va al inventario», y confirma de nuevo.
          </p>
        )}
        <label className="block max-w-xs">
          <span className="label">Fecha de la factura</span>
          <input type="date" name="issueDate" defaultValue={p.issueDate ?? ""} disabled={locked} className="input" />
        </label>
        <div className="space-y-3">
          {lines.map((l) => {
            const kg = l.kgPerUnit ? l.quantity * l.kgPerUnit : null;
            const lineLocked = locked && entered.has(l.id);
            const noWeight = !lineLocked && !!l.rawMaterialId && !(l.kgPerUnit && l.kgPerUnit > 0);
            return (
              <div key={l.id} className="card grid gap-3 sm:grid-cols-[2fr_1fr_1fr]" style={noWeight ? { borderColor: "var(--bad)" } : undefined}>
                <div>
                  <p className="font-medium">{l.description}</p>
                  <p className="text-sm text-muted">
                    {fmtNum(l.quantity)} {l.unit ?? ""} · {fmtCOP(l.lineTotal)} sin IVA
                    {kg ? ` · ${fmtNum(kg)} kg a ${fmtCOP(l.lineTotal / kg)}/kg` : ""}
                  </p>
                  {noWeight && <p className="mt-1 text-sm font-medium" style={{ color: "var(--bad)" }}>Falta el peso: escribe cuántos kg trae cada unidad.</p>}
                </div>
                <label>
                  <span className="label">Insumo</span>
                  <select name={`raw-${l.id}`} defaultValue={l.rawMaterialId ?? ""} disabled={lineLocked} className="input">
                    <option value="">No va al inventario</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label>
                  <span className="label">Kg por unidad</span>
                  <input name={`kg-${l.id}`} inputMode="decimal" defaultValue={l.kgPerUnit ?? ""} disabled={lineLocked} className="input" placeholder="ej. 22,68" />
                </label>
              </div>
            );
          })}
        </div>
        {!locked ? (
          <div className="flex flex-wrap gap-2">
            <button formAction={confirmPurchase} className="btn-primary">Confirmar y sumar al inventario</button>
            <button formAction={saveDraft} className="btn-secondary">Guardar sin confirmar</button>
            <button formAction={deleteDraft} className="btn-secondary text-red-600">Descartar</button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-green-700 dark:text-green-400">
              Confirmada. Los kilos ya entraron al inventario y la próxima factura de este proveedor se reconocerá sola.
            </p>
            {lines.some((l) => !entered.has(l.id)) && (
              <div className="card space-y-2">
                <p className="text-sm">
                  Las líneas con insumo y kilos por unidad que no habían sumado al inventario se pueden completar aquí: elige el insumo y los kg por unidad y pulsa el botón.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="alreadyCounted" /> Esos kilos ya estaban en el conteo físico (solo actualizar el costo del insumo)
                </label>
                <button formAction={completePurchaseLines} className="btn-secondary">Sumar al inventario las líneas que faltaron</button>
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
