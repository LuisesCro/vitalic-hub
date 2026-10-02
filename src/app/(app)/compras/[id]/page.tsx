import { asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { purchaseLines, purchases, rawMaterials, suppliers } from "@/db/schema";
import { fmtCOP, fmtNum } from "@/lib/format";
import { confirmPurchase, deleteDraft, saveDraft } from "../actions";

export default async function CompraPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
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
  const locked = p.status === "confirmada";
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

      <form className="space-y-4">
        <input type="hidden" name="purchaseId" value={p.id} />
        <label className="block max-w-xs">
          <span className="label">Fecha de la factura</span>
          <input type="date" name="issueDate" defaultValue={p.issueDate ?? ""} disabled={locked} className="input" />
        </label>
        <div className="space-y-3">
          {lines.map((l) => {
            const kg = l.kgPerUnit ? l.quantity * l.kgPerUnit : null;
            return (
              <div key={l.id} className="card grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
                <div>
                  <p className="font-medium">{l.description}</p>
                  <p className="text-sm text-muted">
                    {fmtNum(l.quantity)} {l.unit ?? ""} · {fmtCOP(l.lineTotal)} sin IVA
                    {kg ? ` · ${fmtNum(kg)} kg a ${fmtCOP(l.lineTotal / kg)}/kg` : ""}
                  </p>
                </div>
                <label>
                  <span className="label">Insumo</span>
                  <select name={`raw-${l.id}`} defaultValue={l.rawMaterialId ?? ""} disabled={locked} className="input">
                    <option value="">No va al inventario</option>
                    {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </label>
                <label>
                  <span className="label">Kg por unidad</span>
                  <input name={`kg-${l.id}`} inputMode="decimal" defaultValue={l.kgPerUnit ?? ""} disabled={locked} className="input" placeholder="ej. 22,68" />
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
          <p className="text-sm text-green-700 dark:text-green-400">
            Confirmada. Los kilos ya entraron al inventario y la próxima factura de este proveedor se reconocerá sola.
          </p>
        )}
      </form>
    </div>
  );
}
