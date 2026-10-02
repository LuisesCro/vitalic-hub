import { requireAdmin } from "@/lib/session";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { expenses } from "@/db/schema";
import { fmtCOP, fmtMonth, fmtPct, todayISO } from "@/lib/format";
import { expensesByMonth, monthlySales } from "@/lib/reports";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { addExpense, copyExpenses, deleteExpense } from "./actions";

export const metadata = { title: "Resultados · Vitalic Hub" };

export default async function ResultadosPage() {
  await requireAdmin();
  const [months, exp, recent] = await Promise.all([
    monthlySales(),
    expensesByMonth(),
    db.select().from(expenses).orderBy(desc(expenses.month), desc(expenses.id)).limit(60),
  ]);
  const rows = months.slice(-12).map((m) => {
    const e = exp.get(m.month)?.total ?? 0;
    const net = m.grossProfit - e;
    return { ...m, expenses: e, net, netMargin: m.sales ? net / m.sales : 0 };
  });
  const thisMonth = todayISO().slice(0, 7);
  const lastWithExpenses = [...exp.keys()].sort().at(-1);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Resultados mes a mes</h1>
      <p className="text-sm text-muted">
        Ventas y costo de ventas desde Vendty (sin IVA). La utilidad neta solo es real en los meses con todos los gastos cargados.
      </p>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>Mes</th><th className="text-right">Ventas</th><th className="text-right">Margen bruto</th><th className="text-right">Utilidad bruta</th><th className="text-right">Gastos</th><th className="text-right">Utilidad neta</th><th className="text-right">Margen neto</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.month}>
                <td>{fmtMonth(r.month)}</td><td className="text-right">{fmtCOP(r.sales)}</td><td className="text-right">{fmtPct(r.grossMargin)}</td>
                <td className="text-right">{fmtCOP(r.grossProfit)}</td><td className="text-right">{r.expenses ? fmtCOP(r.expenses) : "Sin cargar"}</td>
                <td className={`text-right font-semibold ${r.expenses ? (r.net < 0 ? "text-red-600" : "text-green-700 dark:text-green-400") : "text-muted"}`}>{r.expenses ? fmtCOP(r.net) : "—"}</td>
                <td className="text-right">{r.expenses ? fmtPct(r.netMargin) : "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="text-muted">Importa las ventas de Vendty para ver resultados.</td></tr>}
          </tbody>
        </table>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">Registrar gasto</h2>
        <form action={addExpense} className="grid gap-3 sm:grid-cols-5">
          <label><span className="label">Mes</span><input name="month" type="month" defaultValue={thisMonth} required className="input" /></label>
          <label className="sm:col-span-2"><span className="label">Categoría</span>
            <select name="category" className="input">{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label><span className="label">Valor (COP)</span><input name="amount" inputMode="numeric" required className="input" /></label>
          <div className="flex items-end"><button className="btn-primary">Agregar</button></div>
        </form>
        {lastWithExpenses && lastWithExpenses !== thisMonth && (
          <form action={copyExpenses} className="flex items-center gap-2 text-sm">
            <input type="hidden" name="from" value={lastWithExpenses} />
            <input type="hidden" name="to" value={thisMonth} />
            <button className="btn-secondary">Copiar gastos de {fmtMonth(lastWithExpenses)} a {fmtMonth(thisMonth)}</button>
          </form>
        )}
        <table className="table-base">
          <tbody>
            {recent.map((e) => (
              <tr key={e.id}>
                <td>{fmtMonth(e.month.slice(0, 7))}</td><td>{e.category}</td><td className="text-right">{fmtCOP(e.amount)}</td>
                <td className="text-right">
                  <form action={deleteExpense}><input type="hidden" name="id" value={e.id} /><input type="hidden" name="month" value={e.month} /><button className="text-xs text-red-600 underline">Borrar</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
