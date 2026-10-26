import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fmtCOP, fmtPct, todayISO } from "@/lib/format";
import { monthReport } from "@/lib/month-report";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Informe del mes · Vitalic Hub" };

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);

export default async function InformePage({ searchParams }: { searchParams: Promise<{ hasta?: string }> }) {
  await requireAdmin();
  const { hasta } = await searchParams;
  const today = todayISO();
  const to = hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta) && hasta <= today ? hasta : addDays(today, -1);
  const from = `${to.slice(0, 7)}-01`;
  const r = await monthReport(from, to);
  const net = r.totals.profit - r.expensesTotal;
  const section = "card overflow-x-auto";
  const Table = ({ head, rows }: { head: string[]; rows: (string | number)[][] }) => (
    <table className="table-base">
      <thead><tr>{head.map((h, i) => <th key={h} className={i ? "text-right" : ""}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j} className={j ? "text-right tabular-nums" : ""}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
  return (
    <div className="space-y-4">
      <PageHeader title="Informe del mes" subtitle={`Del ${from} al ${to}, sin IVA salvo donde se dice.`}>
        <form className="flex items-end gap-2"><label><span className="label">Hasta</span><input type="date" name="hasta" defaultValue={to} max={today} className="input" /></label><button className="btn-secondary">Ver</button></form>
        <Link href="/resultados" className="btn-secondary">← Resultados</Link>
      </PageHeader>

      <section className={section}>
        <h2 className="mb-2 font-semibold">Resumen</h2>
        <Table head={["Concepto", "Valor"]} rows={[
          ["Ventas sin IVA", fmtCOP(r.totals.net)], ["IVA cobrado", fmtCOP(r.totals.tax)], ["Total cobrado (con IVA)", fmtCOP(r.totals.gross)],
          ["Recibos", r.totals.tickets], ["Utilidad bruta", fmtCOP(Math.round(r.totals.profit))], ["Margen bruto", fmtPct(r.totals.margin)],
          ["Gastos cargados del mes", fmtCOP(r.expensesTotal)], ["Resultado (utilidad bruta - gastos)", fmtCOP(Math.round(net))],
          ["Ventas con costo cargado", fmtPct(r.totals.salesWithCostShare)], ["Valor del inventario (a costo)", fmtCOP(Math.round(r.inventoryValue))],
          ["Alertas de inventario", `${r.alertsOut} agotados y ${r.alertsLow} bajos`],
        ]} />
      </section>
      <section className={section}><h2 className="mb-2 font-semibold">Ventas por día</h2>
        <Table head={["Día", "Recibos", "Ventas sin IVA", "Total con IVA", "Utilidad", "Margen"]} rows={r.days.map((d) => [d.day, d.tickets, fmtCOP(d.sales), fmtCOP(d.total), fmtCOP(Math.round(d.profit)), fmtPct(d.margin)])} /></section>
      <section className={section}><h2 className="mb-2 font-semibold">Cobrado por medio de pago (cajas del mes)</h2>
        <Table head={["Medio", "Valor"]} rows={r.byMethod.map((m) => [m.label, fmtCOP(m.value)])} /></section>
      <section className={section}><h2 className="mb-2 font-semibold">Cierres de caja</h2>
        <Table head={["Día", "Estado", "Ventas", "Debería haber", "Contado", "Diferencia"]} rows={r.cash.map((c) => [c.day, c.status, fmtCOP(c.sales), fmtCOP(c.expected), c.counted === null ? "—" : fmtCOP(c.counted), c.diff === null ? "—" : fmtCOP(c.diff)])} /></section>
      <section className={section}><h2 className="mb-2 font-semibold">Los 15 productos que más vendieron</h2>
        <Table head={["Producto", "Unidades", "Ventas", "Utilidad", "Margen"]} rows={r.topSales.map((p) => [p.name, p.units, fmtCOP(Math.round(p.sales)), p.profit === null ? "sin costo" : fmtCOP(Math.round(p.profit)), fmtPct(p.margin)])} /></section>
      <section className={section}><h2 className="mb-2 font-semibold">Los 12 productos que más utilidad dejaron</h2>
        <Table head={["Producto", "Unidades", "Ventas", "Utilidad", "Margen"]} rows={r.topProfit.map((p) => [p.name, p.units, fmtCOP(Math.round(p.sales)), fmtCOP(Math.round(p.profit ?? 0)), fmtPct(p.margin)])} /></section>
      <section className={section}><h2 className="mb-2 font-semibold">Productos de buena venta con margen menor a 25 %</h2>
        <Table head={["Producto", "Unidades", "Ventas", "Utilidad", "Margen"]} rows={r.lowMargin.map((p) => [p.name, p.units, fmtCOP(Math.round(p.sales)), fmtCOP(Math.round(p.profit ?? 0)), fmtPct(p.margin)])} /></section>
      <section className={section}><h2 className="mb-2 font-semibold">Gastos del mes</h2>
        <Table head={["Categoría", "Valor"]} rows={r.expenses.map((e) => [e.category, fmtCOP(e.amount)])} /></section>
      <section className={section}><h2 className="mb-2 font-semibold">Facturas de proveedores por pagar</h2>
        <Table head={["Proveedor", "Factura", "Emitida", "Vence", "Total", "Saldo", "Días vencida"]} rows={r.payables.map((p) => [p.supplier, p.invoice, p.issued ?? "—", p.due ?? "—", fmtCOP(p.total), fmtCOP(Math.round(p.balance)), p.daysOverdue])} /></section>
    </div>
  );
}
