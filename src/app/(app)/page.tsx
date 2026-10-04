import { requireAdmin } from "@/lib/session";
import Link from "next/link";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { cashSessions, purchases, rawMaterials } from "@/db/schema";
import { fmtCOP, fmtMonth, fmtPct, todayISO } from "@/lib/format";
import { expensesByMonth, monthlySales, productPerformance, rawMaterialConsumption, trackedRawMaterialIds } from "@/lib/reports";
import { getSettings } from "@/lib/settings";
import { EmptyState, StatCard, TodoRow } from "@/components/ui";
import { SalesChart } from "@/components/sales-chart";
import {
  IconBag, IconBox, IconCash, IconScale, IconChart, IconReceipt, IconTag, IconTrendDown, IconTrendUp, IconUpload,
} from "@/components/icons";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Bogota" }).format(new Date()));
  return hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches";
}

const fmtToday = () =>
  new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Bogota" }).format(new Date());

export default async function InicioPage() {
  const session = await requireAdmin();
  // Una consulta a la vez: en Netlify con el pooler de Supabase, nueve consultas
  // simultáneas dejaban la página colgada. En serie tardan unos 60 ms en total.
  const months = await monthlySales();
  const exp = await expensesByMonth();
  const perf = await productPerformance(90);
  const consumption = await rawMaterialConsumption(90);
  const materials = await db.select().from(rawMaterials).where(eq(rawMaterials.active, true));
  const [pending] = await db.select({ n: count() }).from(purchases).where(eq(purchases.status, "borrador"));
  const s = await getSettings();
  const tracked = await trackedRawMaterialIds();
  const [cash] = await db
    .select({ status: cashSessions.status, opening: cashSessions.openingCash })
    .from(cashSessions)
    .where(eq(cashSessions.businessDate, todayISO()));

  const thisMonth = todayISO().slice(0, 7);
  const closed = months.filter((m) => m.month < thisMonth && m.invoices > 100).slice(-6); // meses completos recientes
  const last = closed.at(-1);
  const prev = closed.at(-2);
  const avgSales = closed.length ? closed.reduce((t, m) => t + m.sales, 0) / closed.length : 0;
  const avgGross = closed.length ? closed.reduce((t, m) => t + m.grossProfit, 0) / closed.length : 0;
  const avgMargin = avgSales ? avgGross / avgSales : 0;
  const fixed = last ? exp.get(last.month)?.total ?? null : null;
  const net = fixed === null || !last ? null : last.grossProfit - fixed;
  const breakEven = fixed && avgMargin ? fixed / avgMargin : null;
  const salesDelta = last && prev && prev.sales ? last.sales / prev.sales - 1 : null;

  const toOrder = materials.filter((m) => {
    const perDay = consumption.get(m.id) ?? 0;
    return tracked.has(m.id) && perDay > 0 && (m.stockGrams <= 0 || m.stockGrams / perDay < 14 || (m.minStockGrams > 0 && m.stockGrams <= m.minStockGrams));
  });
  const lowMarginA = perf.filter((r) => r.abc === "A" && r.margin !== null && r.margin < s.margenMinimo);
  const chart = months.slice(-12).map((m) => ({ ...m, partial: m.month === thisMonth }));

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted first-letter:uppercase">{fmtToday()}</p>
        <h1>{greeting()}, {session.name}</h1>
      </div>

      {months.length === 0 ? (
        <EmptyState
          title="Empecemos con tus datos"
          action={<Link href="/importar" className="btn-primary mt-2"><IconUpload /> Importar desde Vendty</Link>}
        >
          Sube el catálogo y las ventas de Vendty. Con eso verás ventas, márgenes, productos estrella y precios recomendados.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={`Ventas ${last ? fmtMonth(last.month) : ""}`}
            value={fmtCOP(last?.sales)}
            icon={<IconChart className="size-4" />}
            hint={
              salesDelta === null ? "Sin IVA" : (
                <span className="inline-flex items-center gap-1" style={{ color: salesDelta >= 0 ? "var(--good)" : "var(--bad)" }}>
                  {salesDelta >= 0 ? <IconTrendUp className="size-3.5" /> : <IconTrendDown className="size-3.5" />}
                  {fmtPct(salesDelta)} vs. {fmtMonth(prev!.month)}
                </span>
              )
            }
          />
          <StatCard label="Margen bruto" value={fmtPct(avgMargin)} hint={`Meta mínima ${fmtPct(s.margenMinimo)} · 6 meses`} tone={avgMargin < s.margenMinimo ? "bad" : "good"} icon={<IconTag className="size-4" />} />
          <StatCard label="Utilidad bruta / mes" value={fmtCOP(avgGross)} hint="Promedio 6 meses" icon={<IconTrendUp className="size-4" />} />
          <StatCard
            label={`Utilidad neta ${last ? fmtMonth(last.month) : ""}`}
            value={net === null ? "Faltan gastos" : fmtCOP(net)}
            tone={net === null ? undefined : net < 0 ? "bad" : "good"}
            hint={net === null ? <Link className="underline" href="/resultados">Cargar gastos del mes</Link> : "Después de gastos fijos"}
            icon={<IconCash className="size-4" />}
          />
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <section className="card min-w-0">
          <h2 className="mb-1 font-semibold">Pendientes de hoy</h2>
          <div className="-mx-2">
            <TodoRow
              href="/caja"
              icon={<IconCash />}
              done={cash?.status === "cerrada"}
              title={!cash ? "Abrir la caja" : cash.status === "abierta" ? "Cerrar y cuadrar la caja" : "Caja cuadrada"}
              detail={cash?.status === "abierta" ? `Abierta con base de ${fmtCOP(cash.opening)}` : undefined}
            />
            <TodoRow
              href="/compras"
              icon={<IconReceipt />}
              done={pending.n === 0}
              title={pending.n === 0 ? "Sin facturas por revisar" : `${pending.n} ${pending.n === 1 ? "factura" : "facturas"} por confirmar`}
              detail={pending.n ? "Confírmalas para que entren al inventario" : undefined}
            />
            <TodoRow
              href="/inventario"
              icon={<IconBox />}
              done={toOrder.length === 0}
              title={toOrder.length === 0 ? "Inventario al día" : `${toOrder.length} ${toOrder.length === 1 ? "insumo" : "insumos"} para pedir`}
              detail={toOrder.slice(0, 4).map((m) => m.name).join(", ")}
            />
            <TodoRow
              href="/productos?vista=A"
              icon={<IconTag />}
              done={lowMarginA.length === 0}
              title={lowMarginA.length === 0 ? "Productos estrella con buen margen" : `${lowMarginA.length} productos estrella bajo ${fmtPct(s.margenMinimo)}`}
              detail={lowMarginA.slice(0, 3).map((r) => r.name).join(", ")}
            />
          </div>
        </section>

        <section className="card min-w-0">
          <div className="mb-4 flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">Ventas por mes</h2>
            <span className="text-xs text-muted">Sin IVA · últimos 12 meses</span>
          </div>
          {chart.length ? <SalesChart points={chart} /> : <p className="py-10 text-center text-sm text-muted">Aún no hay ventas importadas.</p>}
        </section>
      </div>

      {breakEven && last && (
        <section className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Punto de equilibrio</h2>
            <span className="text-sm text-muted">Necesitas <strong className="text-[var(--text)]">{fmtCOP(breakEven)}</strong> al mes sin IVA</span>
          </div>
          <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min((avgSales / breakEven) * 100, 100)}%`, background: avgSales >= breakEven ? "var(--good)" : "var(--color-leaf-500)" }}
            />
          </div>
          <p className="mt-2 text-sm text-muted">
            Vendes en promedio {fmtCOP(avgSales)} ({fmtPct(avgSales / breakEven)} del equilibrio).
            {avgSales < breakEven && ` Faltan ${fmtCOP(breakEven - avgSales)} al mes, o subir el margen.`} Gastos de {fmtMonth(last.month)}: {fmtCOP(fixed)}.
          </p>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-semibold">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickAction href="/compras" icon={<IconReceipt />} title="Subir factura" detail="XML, PDF o foto" />
          <QuickAction href="/empaque" icon={<IconBag />} title="Registrar empaque" detail="Granel a bolsas" />
          <QuickAction href="/precios" icon={<IconTag />} title="Revisar precios" detail="Catálogos de competencia" />
          <QuickAction href="/caja/cotizar" icon={<IconScale />} title="Cotizar por kilo" detail="Precio por cantidad o bulto" />
        </div>
      </section>

      {months.length > 0 && (
        <section className="card overflow-x-auto">
          <h2 className="mb-2 font-semibold">Últimos meses</h2>
          <table className="table-base">
            <thead><tr><th>Mes</th><th className="text-right">Ventas</th><th className="text-right">Margen</th><th className="text-right">Utilidad bruta</th><th className="text-right">Facturas</th><th className="text-right">Ticket promedio</th></tr></thead>
            <tbody>
              {months.slice(-6).reverse().map((m) => (
                <tr key={m.month}>
                  <td className="whitespace-nowrap first-letter:uppercase">{fmtMonth(m.month)}{m.month === thisMonth ? " (en curso)" : ""}</td><td className="text-right">{fmtCOP(m.sales)}</td><td className="text-right">{fmtPct(m.grossMargin)}</td>
                  <td className="text-right">{fmtCOP(m.grossProfit)}</td><td className="text-right">{m.invoices}</td><td className="text-right">{fmtCOP(m.invoices ? m.total / m.invoices : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function QuickAction({ href, icon, title, detail }: { href: string; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <Link href={href} className="card group flex flex-col gap-2 transition-colors hover:border-brand-500">
      <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700 transition-colors group-hover:bg-brand-600 group-hover:text-white dark:bg-white/5 dark:text-brand-500">
        {icon}
      </span>
      <span>
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{detail}</span>
      </span>
    </Link>
  );
}
