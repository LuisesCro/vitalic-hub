import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { purchases, rawMaterials } from "@/db/schema";
import { fmtCOP, fmtMonth, fmtPct } from "@/lib/format";
import { expensesByMonth, monthlySales, productPerformance, rawMaterialConsumption, trackedRawMaterialIds } from "@/lib/reports";
import { getSettings } from "@/lib/settings";

export default async function TableroPage() {
  const [months, exp, perf, consumption, materials, [pending], s, tracked] = await Promise.all([
    monthlySales(), expensesByMonth(), productPerformance(90), rawMaterialConsumption(90),
    db.select().from(rawMaterials).where(eq(rawMaterials.active, true)),
    db.select({ n: count() }).from(purchases).where(eq(purchases.status, "borrador")),
    getSettings(),
    trackedRawMaterialIds(),
  ]);

  const closed = months.filter((m) => m.invoices > 100).slice(-6); // meses completos recientes
  const last = closed.at(-1);
  const avgSales = closed.length ? closed.reduce((t, m) => t + m.sales, 0) / closed.length : 0;
  const avgGross = closed.length ? closed.reduce((t, m) => t + m.grossProfit, 0) / closed.length : 0;
  const avgMargin = avgSales ? avgGross / avgSales : 0;
  const fixed = last ? exp.get(last.month)?.total ?? null : null;
  const breakEven = fixed && avgMargin ? fixed / avgMargin : null;

  const toOrder = materials.filter((m) => {
    const perDay = consumption.get(m.id) ?? 0;
    return tracked.has(m.id) && perDay > 0 && (m.stockGrams <= 0 || m.stockGrams / perDay < 14 || (m.minStockGrams > 0 && m.stockGrams <= m.minStockGrams));
  });
  const lowMarginA = perf.filter((r) => r.abc === "A" && r.margin !== null && r.margin < s.margenMinimo);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Tablero</h1>
      {months.length === 0 && (
        <p className="card text-sm">Aún no hay datos. Empieza en <Link className="underline" href="/importar">Importar</Link> con el catálogo y las ventas de Vendty.</p>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={`Ventas ${last ? fmtMonth(last.month) : ""} (sin IVA)`} value={fmtCOP(last?.sales)} />
        <Kpi label="Margen bruto (6 meses)" value={fmtPct(avgMargin)} />
        <Kpi label="Utilidad bruta promedio/mes" value={fmtCOP(avgGross)} />
        <Kpi
          label={`Utilidad neta ${last ? fmtMonth(last.month) : ""}`}
          value={fixed === null ? "Faltan gastos" : fmtCOP((last?.grossProfit ?? 0) - fixed)}
          tone={fixed === null ? undefined : (last?.grossProfit ?? 0) - fixed < 0 ? "bad" : "good"}
        />
      </div>
      {breakEven && (
        <p className="card text-sm">
          Punto de equilibrio: con los gastos de {fmtMonth(last!.month)} ({fmtCOP(fixed)}) y un margen de {fmtPct(avgMargin)}, se necesitan
          <strong> {fmtCOP(breakEven)}</strong> de ventas al mes sin IVA. Promedio actual: {fmtCOP(avgSales)}.
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        <Alert href="/inventario" title="Insumos para pedir" n={toOrder.length} detail={toOrder.slice(0, 5).map((m) => m.name).join(", ")} />
        <Alert href="/productos?vista=A" title="Productos A con margen bajo" n={lowMarginA.length} detail={lowMarginA.slice(0, 5).map((r) => r.name).join(", ")} />
        <Alert href="/compras" title="Facturas por revisar" n={pending.n} detail="Compras cargadas sin confirmar" />
      </div>
      <section className="card overflow-x-auto">
        <h2 className="mb-2 font-semibold">Últimos meses</h2>
        <table className="table-base">
          <thead><tr><th>Mes</th><th className="text-right">Ventas</th><th className="text-right">Margen</th><th className="text-right">Utilidad bruta</th><th className="text-right">Facturas</th><th className="text-right">Ticket promedio</th></tr></thead>
          <tbody>
            {months.slice(-6).reverse().map((m) => (
              <tr key={m.month}>
                <td>{fmtMonth(m.month)}</td><td className="text-right">{fmtCOP(m.sales)}</td><td className="text-right">{fmtPct(m.grossMargin)}</td>
                <td className="text-right">{fmtCOP(m.grossProfit)}</td><td className="text-right">{m.invoices}</td><td className="text-right">{fmtCOP(m.invoices ? m.total / m.invoices : null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="card">
      <p className="label">{label}</p>
      <p className={`text-lg font-semibold ${tone === "bad" ? "text-red-600" : tone === "good" ? "text-green-700 dark:text-green-400" : ""}`}>{value}</p>
    </div>
  );
}

function Alert({ href, title, n, detail }: { href: string; title: string; n: number; detail: string }) {
  return (
    <Link href={href} className="card block min-w-0 hover:border-brand-500">
      <p className="label">{title}</p>
      <p className={`text-2xl font-semibold ${n > 0 ? "text-amber-600" : ""}`}>{n}</p>
      {n > 0 && <p className="truncate text-xs text-muted">{detail}</p>}
    </Link>
  );
}
