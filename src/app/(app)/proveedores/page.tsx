import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchaseLines, purchases, supplierPayments, suppliers } from "@/db/schema";
import { PageHeader, StatCard } from "@/components/ui";
import { fmtCOP, todayISO } from "@/lib/format";
import { payStatus } from "@/lib/payables";
import { requireAdmin } from "@/lib/session";
import { SupplierForm } from "./supplier-form";

export const metadata = { title: "Proveedores · Vitalic Hub" };

export default async function ProveedoresPage() {
  await requireAdmin();
  const today = todayISO();
  const list = await db.select().from(suppliers).orderBy(suppliers.name);
  const paid = db
    .select({ purchaseId: supplierPayments.purchaseId, paid: sql<string>`sum(${supplierPayments.amount})`.as("paid") })
    .from(supplierPayments).groupBy(supplierPayments.purchaseId).as("p");
  const invoices = await db
    .select({ id: purchases.id, supplierId: purchases.supplierId, total: purchases.total, date: purchases.issueDate, due: purchases.dueDate, paid: paid.paid })
    .from(purchases).leftJoin(paid, eq(paid.purchaseId, purchases.id)).orderBy(desc(purchases.issueDate));
  const lines = await db
    .select({ supplierId: purchases.supplierId, description: purchaseLines.description, total: sql<number>`sum(${purchaseLines.lineTotal})`.mapWith(Number) })
    .from(purchaseLines).innerJoin(purchases, eq(purchases.id, purchaseLines.purchaseId))
    .groupBy(purchases.supplierId, purchaseLines.description);


  const rows = list.map((s) => {
    const mine = invoices.filter((i) => i.supplierId === s.id).map((i) => ({ ...i, ...payStatus(i.total, Number(i.paid ?? 0), i.due, today) }));
    const owed = mine.reduce((t, i) => t + i.balance, 0);
    const overdue = mine.filter((i) => i.status === "vencida").reduce((t, i) => t + i.balance, 0);
    const bought = mine.reduce((t, i) => t + i.total, 0);
    const items = lines.filter((l) => l.supplierId === s.id).sort((a, b) => b.total - a.total).slice(0, 6).map((l) => l.description.toLowerCase());
    return { s, owed, overdue, bought, items };
  }).sort((a, b) => b.owed - a.owed || a.s.name.localeCompare(b.s.name));

  const totalOwed = rows.reduce((t, r) => t + r.owed, 0);
  const totalOverdue = rows.reduce((t, r) => t + r.overdue, 0);

  return (
    <div className="space-y-5">
      <PageHeader title="Proveedores" subtitle="Quién nos vende, cuánto se les ha comprado y cuánto se les debe." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Proveedores" value={String(rows.length)} />
        <StatCard label="Por pagar" value={fmtCOP(totalOwed)} />
        <StatCard label="Vencido" value={fmtCOP(totalOverdue)} tone={totalOverdue ? "bad" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {rows.map(({ s, owed, overdue, bought, items }) => (
          <section key={s.id} className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-semibold leading-tight">{s.name}</h2>
                <p className="text-xs text-muted">{s.nit ? `NIT ${s.nit}` : "Sin NIT"}{s.phone ? ` · ${s.phone}` : ""}</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1.5">
                <Link href={`/compras?proveedor=${s.id}`} className="btn-secondary text-center text-sm">Ver facturas</Link>
                <Link href={`/proveedores/${s.id}/productos`} className="btn-secondary text-center text-sm">Lista de productos</Link>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div><dt className="text-xs text-muted">Comprado</dt><dd className="font-semibold tabular-nums">{fmtCOP(bought)}</dd></div>
              <div><dt className="text-xs text-muted">Se les debe</dt><dd className="font-semibold tabular-nums" style={owed ? { color: overdue ? "var(--bad)" : undefined } : undefined}>{fmtCOP(owed)}</dd></div>
            </dl>
            {s.notes && <p className="text-sm">{s.notes}</p>}
            {items.length > 0 && <p className="text-xs text-muted">Lo que más se les ha comprado: {items.join(", ")}.</p>}
            <details>
              <summary className="cursor-pointer text-sm underline">Editar datos</summary>
              <div className="pt-3"><SupplierForm initial={{ id: s.id, name: s.name, nit: s.nit ?? "", phone: s.phone ?? "", notes: s.notes ?? "" }} button="Guardar" /></div>
            </details>
          </section>
        ))}
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold">Agregar un proveedor</h2>
        <SupplierForm button="Agregar proveedor" />
      </section>
    </div>
  );
}
