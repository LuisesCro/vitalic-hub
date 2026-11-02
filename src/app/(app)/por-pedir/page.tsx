import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { purchaseLines, purchases, quoteItems, restockRequests, suppliers, users } from "@/db/schema";
import { loadComponents } from "@/lib/components";
import { rawMaterialConsumption } from "@/lib/reports";
import { addToQuote } from "../proveedores/actions";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/session";
import { stockAlerts, type StockAlert } from "@/lib/stock-alerts";
import { markOrdered, toggleUrgent } from "./actions";

export const metadata = { title: "Lo que se acaba · Vitalic Hub" };

const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });
const when = (a: StockAlert) => (a.level === "agotado" ? "Agotado" : a.days === null ? `Quedan ${fmt(a.stock)} ${a.unit}` : a.days < 1 ? "Menos de 1 día" : `~${Math.round(a.days)} ${Math.round(a.days) === 1 ? "día" : "días"}`);
const stamp = (d: Date) => d.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

export default async function PorPedirPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const alerts = await stockAlerts({ insumos: true });
  const pending = await db
    .select({ r: restockRequests, by: users.name })
    .from(restockRequests)
    .leftJoin(users, eq(restockRequests.requestedBy, users.id))
    .where(eq(restockRequests.status, "pendiente"))
    .orderBy(desc(restockRequests.id));
  // Datos para "Agregar al proveedor": a qué insumo corresponde cada alerta, quién se lo vendió la última vez y cuánto pedir.
  const [recipes, consumption, supplierList, drafts] = isAdmin
    ? await Promise.all([
        loadComponents(), rawMaterialConsumption(90),
        db.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).orderBy(suppliers.name),
        db.select({ rawMaterialId: quoteItems.rawMaterialId, supplierId: quoteItems.supplierId }).from(quoteItems).where(eq(quoteItems.status, "borrador")),
      ])
    : [new Map(), new Map<number, number>(), [], []];
  const rawOf = (kind: string, id: number): number | null => {
    if (kind === "insumo") return id;
    const comps = recipes.get(id) ?? [];
    return comps.length === 1 ? comps[0].rawMaterialId : null;
  };
  const wanted = [...new Set(alerts.map((a) => rawOf(a.kind, a.id)).filter((x): x is number => x !== null))];
  const lastSupplier = new Map<number, number>();
  if (isAdmin && wanted.length) {
    const hist = await db
      .select({ raw: purchaseLines.rawMaterialId, supplierId: purchases.supplierId })
      .from(purchaseLines).innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
      .where(inArray(purchaseLines.rawMaterialId, wanted)).orderBy(desc(purchases.issueDate), desc(purchases.id));
    for (const h of hist) if (h.raw && h.supplierId && !lastSupplier.has(h.raw)) lastSupplier.set(h.raw, h.supplierId);
  }
  const inQuote = new Map(drafts.filter((d) => d.rawMaterialId).map((d) => [d.rawMaterialId as number, d.supplierId]));
  const supplierName = new Map(supplierList.map((x) => [x.id, x.name]));
  const suggestKg = (raw: number, stockKg: number) => {
    const perDay = consumption.get(raw) ?? 0; // gramos por día
    if (!(perDay > 0)) return 10;
    return Math.max(5, Math.ceil(((perDay * 30) / 1000 - Math.max(stockKg, 0)) / 5) * 5);
  };
  const Adder = ({ kind, id, stockKg }: { kind: string; id: number; stockKg: number }) => {
    if (!isAdmin) return null;
    const raw = rawOf(kind, id);
    if (!raw) return <span className="text-xs text-muted">Sin insumo único</span>;
    const already = inQuote.get(raw);
    if (already) return <Link href="/cotizaciones" className="text-xs font-medium underline" style={{ color: "var(--good)" }}>✓ Por cotizar a {supplierName.get(already)}</Link>;
    return (
      <form action={addToQuote} className="flex flex-wrap items-center gap-1">
        <input type="hidden" name="rawMaterialId" value={raw} />
        <select name="supplierId" defaultValue={lastSupplier.get(raw) ?? ""} required className="input !py-1 text-xs" aria-label="Proveedor">
          <option value="" disabled>Proveedor…</option>
          {supplierList.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <input name="qtyKg" inputMode="decimal" defaultValue={suggestKg(raw, stockKg)} className="input !py-1 w-16 text-xs" aria-label="Kilos a pedir" title="Kilos a pedir" />
        <button className="btn-secondary !px-2 !py-1 text-xs">Agregar</button>
      </form>
    );
  };

  const marked = new Set(pending.map((p) => `${p.r.kind}-${p.r.refId}`));
  const red = alerts.filter((a) => a.level === "agotado");
  const rest = alerts.filter((a) => a.level !== "agotado");

  const Row = ({ a }: { a: StockAlert }) => {
    const on = marked.has(`${a.kind}-${a.id}`);
    return (
      <li className="flex items-center justify-between gap-3 py-2">
        <span className="min-w-0">
          <span className="block truncate font-medium">{a.name}</span>
          <span className="text-xs text-muted">{a.kind === "insumo" ? "insumo" : "bolsas"} · <span style={{ color: a.level === "agotado" ? "var(--bad)" : "var(--warn)" }} className="font-semibold">{when(a)}</span></span>
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Adder kind={a.kind} id={a.id} stockKg={a.unit === "kg" ? a.stock : 0} />
        <form action={toggleUrgent}>
          <input type="hidden" name="kind" value={a.kind} />
          <input type="hidden" name="refId" value={a.id} />
          <input type="hidden" name="name" value={a.name} />
          <button className={on ? "btn-primary" : "btn-secondary"}>{on ? "✓ Urgente" : "Marcar urgente"}</button>
        </form>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Lo que se acaba" subtitle={isAdmin ? "Lo que marcó la cajera como urgente y todo lo que se está agotando." : "Marca lo más urgente de pedir. Luis lo ve de inmediato."} />

      <section className="card">
        <h2 className="mb-2 font-semibold">Marcado como urgente ({pending.length})</h2>
        {pending.length === 0 ? <p className="text-sm text-muted">Nada marcado todavía.</p> : (
          <ul className="divide-y divide-[var(--border)]">
            {pending.map(({ r, by }) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="text-xs text-muted">{r.kind === "insumo" ? "insumo" : "bolsas"} · lo marcó {by ?? "—"} · {stamp(r.createdAt)}</span>
                </span>
                {isAdmin && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Adder kind={r.kind} id={r.refId} stockKg={0} />
                    <form action={markOrdered}><input type="hidden" name="id" value={r.id} /><button className="btn-primary">Ya lo pedí</button></form>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card rounded-xl border-2" style={{ borderColor: "var(--bad)" }}>
        <h2 className="mb-1 font-semibold" style={{ color: "var(--bad)" }}>Agotado ({red.length})</h2>
        {red.length === 0 ? <p className="text-sm text-muted">No hay nada agotado.</p> : <ul className="divide-y divide-[var(--border)]">{red.map((a) => <Row key={`${a.kind}-${a.id}`} a={a} />)}</ul>}
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold">Se está acabando ({rest.length})</h2>
        {rest.length === 0 ? <p className="text-sm text-muted">Nada por agotarse.</p> : <ul className="divide-y divide-[var(--border)]">{rest.map((a) => <Row key={`${a.kind}-${a.id}`} a={a} />)}</ul>}
      </section>
    </div>
  );
}
