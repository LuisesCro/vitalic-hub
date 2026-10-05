import { requireAdmin } from "@/lib/session";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { purchases, supplierPayments, suppliers } from "@/db/schema";
import { UploadForm } from "@/components/upload-form";
import { PageHeader, StatCard } from "@/components/ui";
import { fmtCOP, todayISO } from "@/lib/format";
import { daysUntil, payStatus, type PayStatus } from "@/lib/payables";
import { uploadInvoice } from "./actions";
import { PayBadge } from "./status-badge";

export const metadata = { title: "Compras · Vitalic Hub" };

const VIEWS = { todas: "Todas", porpagar: "Por pagar", vencidas: "Vencidas", pagadas: "Pagadas" } as const;
type View = keyof typeof VIEWS;

export default async function ComprasPage({ searchParams }: { searchParams: Promise<{ vista?: string; proveedor?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const vista: View = (params.vista as View) in VIEWS ? (params.vista as View) : "todas";
  const proveedor = params.proveedor ? Number(params.proveedor) : null;
  const today = todayISO();
  const month = today.slice(0, 7);

  const paidByPurchase = db
    .select({ purchaseId: supplierPayments.purchaseId, paid: sql<string>`sum(${supplierPayments.amount})`.as("paid") })
    .from(supplierPayments)
    .groupBy(supplierPayments.purchaseId)
    .as("paid_by_purchase");
  const rows = await db
    .select({
      id: purchases.id, number: purchases.invoiceNumber, date: purchases.issueDate, dueDate: purchases.dueDate,
      total: purchases.total, invStatus: purchases.status, source: purchases.source, term: purchases.paymentTerm,
      supplierId: purchases.supplierId, supplier: suppliers.name, paid: paidByPurchase.paid,
    })
    .from(purchases)
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .leftJoin(paidByPurchase, eq(paidByPurchase.purchaseId, purchases.id))
    .orderBy(desc(purchases.issueDate), desc(purchases.id))
    .limit(300);
  const [{ paidThisMonth }] = await db
    .select({ paidThisMonth: sql<string>`coalesce(sum(${supplierPayments.amount}) filter (where to_char(${supplierPayments.paidOn}, 'YYYY-MM') = ${month} and ${supplierPayments.method} <> 'retencion'), 0)` })
    .from(supplierPayments);

  const all = rows.map((r) => ({ ...r, paid: Number(r.paid ?? 0), ...payStatus(r.total, Number(r.paid ?? 0), r.dueDate, today) }));
  const open = all.filter((r) => r.balance > 0);
  const overdue = open.filter((r) => r.status === "vencida");
  const soon = open.filter((r) => r.status !== "vencida" && (daysUntil(r.dueDate, today) ?? 99) <= 7);
  const bySupplier = new Map<string, { id: number | null; name: string; balance: number; overdue: number; count: number }>();
  for (const r of open) {
    const k = String(r.supplierId ?? r.supplier ?? "—");
    const e = bySupplier.get(k) ?? { id: r.supplierId, name: r.supplier ?? "Sin proveedor", balance: 0, overdue: 0, count: 0 };
    e.balance += r.balance;
    e.count++;
    if (r.status === "vencida") e.overdue += r.balance;
    bySupplier.set(k, e);
  }
  const want: Record<View, (s: PayStatus) => boolean> = {
    todas: () => true,
    porpagar: (s) => s !== "pagada",
    vencidas: (s) => s === "vencida",
    pagadas: (s) => s === "pagada",
  };
  const list = all.filter((r) => want[vista](r.status) && (!proveedor || r.supplierId === proveedor));
  const sum = (xs: { balance: number }[]) => xs.reduce((t, x) => t + x.balance, 0);
  const link = (v: View) => `/compras?vista=${v}${proveedor ? `&proveedor=${proveedor}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader title="Compras y cuentas por pagar" subtitle="Facturas de proveedores: lo que entra al inventario y lo que se debe." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Por pagar" value={fmtCOP(sum(open))} hint={`${open.length} facturas`} />
        <StatCard label="Vencido" value={fmtCOP(sum(overdue))} hint={`${overdue.length} facturas`} tone={overdue.length ? "bad" : undefined} />
        <StatCard label="Vence en 7 días" value={fmtCOP(sum(soon))} hint={`${soon.length} facturas`} />
        <StatCard label="Pagado este mes" value={fmtCOP(Number(paidThisMonth))} hint="Sin contar retenciones" tone="good" />
      </div>

      <section className="card space-y-2">
        <h2 className="font-semibold">Cargar una factura</h2>
        <p className="text-sm text-muted">
          Mejor opción: el .zip o .xml de la factura electrónica que llega al correo (trae proveedor, número, forma de pago
          y vencimiento). También puedes subir una foto o un PDF y la IA lee los datos. Siempre revisas antes de que entre al inventario.
        </p>
        <UploadForm action={uploadInvoice} accept=".xml,.zip,.pdf,image/*" button="Leer factura" />
      </section>

      {bySupplier.size > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">Saldo por proveedor</h2>
          <table className="table-base">
            <thead><tr><th>Proveedor</th><th className="text-right">Facturas</th><th className="text-right">Saldo</th><th className="text-right">Vencido</th></tr></thead>
            <tbody>
              {[...bySupplier.values()].sort((a, b) => b.balance - a.balance).map((s) => (
                <tr key={s.name}>
                  <td>{s.id ? <Link className="underline" href={`/compras?vista=porpagar&proveedor=${s.id}`}>{s.name}</Link> : s.name}</td>
                  <td className="text-right">{s.count}</td>
                  <td className="text-right font-semibold">{fmtCOP(s.balance)}</td>
                  <td className="text-right" style={{ color: s.overdue ? "var(--bad)" : undefined }}>{s.overdue ? fmtCOP(s.overdue) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card overflow-x-auto">
        <div className="mb-3 flex flex-wrap gap-2">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Link key={v} href={link(v)} className={v === vista ? "btn-primary" : "btn-secondary"}>{VIEWS[v]}</Link>
          ))}
          {proveedor && <Link href={`/compras?vista=${vista}`} className="btn-secondary">Quitar filtro de proveedor ✕</Link>}
        </div>
        <table className="table-base">
          <thead>
            <tr><th>Proveedor</th><th>Factura</th><th>Fecha</th><th>Vence</th><th className="text-right">Total</th><th className="text-right">Saldo</th><th>Pago</th><th>Inventario</th></tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <tr key={r.id}>
                <td><Link className="underline" href={`/compras/${r.id}`}>{r.supplier ?? "—"}</Link></td>
                <td>{r.number ?? "—"}</td>
                <td className="whitespace-nowrap">{r.date ?? "—"}</td>
                <td className="whitespace-nowrap">{r.dueDate ?? (r.term === "contado" ? "Contado" : "—")}</td>
                <td className="text-right">{fmtCOP(r.total)}</td>
                <td className="text-right font-semibold">{r.balance ? fmtCOP(r.balance) : "—"}</td>
                <td><PayBadge status={r.status} daysOverdue={r.daysOverdue} /></td>
                <td>
                  <span style={{ color: r.invStatus === "confirmada" ? "var(--good)" : "var(--warn)" }}>
                    {r.invStatus === "confirmada" ? "Confirmada" : "Por revisar"}
                  </span>
                  {r.source === "foto" && <span className="ml-1 text-xs text-muted">(foto)</span>}
                </td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={8} className="text-muted">No hay facturas en esta vista.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
