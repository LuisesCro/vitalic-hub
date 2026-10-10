import { requireAdmin } from "@/lib/session";
import Link from "next/link";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashSessions, purchases, rawMaterials, supplierPayments } from "@/db/schema";
import { fmtCOP, fmtMonth, fmtPct, todayISO } from "@/lib/format";
import { dayProfit, expensesByMonth, monthlySales, productPerformance, rawMaterialConsumption, trackedRawMaterialIds } from "@/lib/reports";
import { salesOfDay } from "@/lib/day-sales";
import { PAYMENT_METHODS } from "@/lib/cash";
import { getSettings } from "@/lib/settings";
import { EmptyState, StatCard, TodoRow } from "@/components/ui";
import { SalesChart } from "@/components/sales-chart";
import {
  IconBag, IconBox, IconCash, IconScale, IconCart, IconChart, IconReceipt, IconTag, IconTrendDown, IconTrendUp, IconUpload,
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
  // Facturas de proveedores vencidas con saldo.
  const [overdue] = await db.execute<{ n: string; saldo: string }>(sql`
    select count(*) as n, coalesce(sum(p.total - coalesce(pg.paid, 0)), 0) as saldo
    from ${purchases} p
    left join (select purchase_id, sum(amount) as paid from ${supplierPayments} group by purchase_id) pg on pg.purchase_id = p.id
    where p.due_date < ${todayISO()} and p.total - coalesce(pg.paid, 0) >= 100`);
  const [cash] = await db
    .select({ status: cashSessions.status, opening: cashSessions.openingCash })
    .from(cashSessions)
    .where(eq(cashSessions.businessDate, todayISO()));

  const today = await salesOfDay(todayISO());
  const todayProfit = await dayProfit(todayISO());
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
  // Encabezado: el mes en curso (lo que va corrido). Si todavía no hay ventas del mes, el último mes completo.
  const cur = months.find((m) => m.month === thisMonth) ?? last;
  const dayOfMonth = Number(todayISO().slice(8, 10));
  const daysInMonth = new Date(Number(thisMonth.slice(0, 4)), Number(thisMonth.slice(5, 7)), 0).getDate();
  const isPartial = !!cur && cur.month === thisMonth;
  const curExpenses = cur ? exp.get(cur.month)?.total ?? null : null;
  const curNet = curExpenses === null || !cur ? null : cur.grossProfit - curExpenses;
  const projected = isPartial && cur && dayOfMonth > 0 ? (cur.sales / dayOfMonth) * daysInMonth : null;
  const prevMonth = cur ? [...closed].reverse().find((m) => m.month < cur.month) : undefined;
  const curDelta = cur && prevMonth && prevMonth.sales ? cur.sales / prevMonth.sales - 1 : null;

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

      <section className="card">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm text-muted">Ventas de hoy</p>
            <p className="text-3xl font-bold tabular-nums">{fmtCOP(today.total)}</p>
          </div>
          <span className="flex flex-wrap gap-2"><Link href="/vender" className="btn-secondary">Ver las ventas del día</Link><Link href="/resultados/dia" className="btn-secondary">Utilidad por producto</Link></span>
        </div>
        {today.total > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {PAYMENT_METHODS.filter((m) => (today.byKey[m.key] ?? 0) > 0).map((m) => (
              <div key={m.key} className="rounded-lg bg-brand-50 px-3 py-2 dark:bg-white/5">
                <p className="text-xs text-muted">{m.label}</p>
                <p className="font-semibold tabular-nums">{fmtCOP(today.byKey[m.key] ?? 0)}</p>
              </div>
            ))}
            <div className="rounded-lg px-3 py-2" style={{ background: todayProfit.grossProfit >= 0 ? "var(--good-bg)" : "var(--bad-bg)" }}>
              <p className="text-xs text-muted">Utilidad del día</p>
              <p className="font-semibold tabular-nums" style={{ color: todayProfit.grossProfit >= 0 ? "var(--good)" : "var(--bad)" }}>{fmtCOP(Math.round(todayProfit.grossProfit))}</p>
              <p className="text-xs text-muted">Margen {fmtPct(todayProfit.grossMargin)}</p>
            </div>
            {today.mixed > 0 && (
              <div className="rounded-lg bg-brand-50 px-3 py-2 dark:bg-white/5">
                <p className="text-xs text-muted">Pagos mixtos</p>
                <p className="font-semibold tabular-nums">{fmtCOP(today.mixed)}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted">Todavía no hay ventas hoy.</p>
        )}
        <p className="mt-2 text-xs text-muted">Ventas con IVA, tal como se cobra (HUB e importado de Vendty). La utilidad es sin IVA: ventas menos el costo de lo vendido.{todayProfit.costedShare < 0.97 && todayProfit.sales > 0 ? ` Ojo: ${Math.round((1 - todayProfit.costedShare) * 100)} % de las ventas de hoy no tiene costo cargado, y la utilidad se estima con el margen del resto.` : ""}</p>
      </section>

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
            label={`Ventas ${cur ? fmtMonth(cur.month) : ""}${isPartial ? " (en curso)" : ""}`}
            value={fmtCOP(cur?.sales)}
            icon={<IconChart className="size-4" />}
            hint={
              isPartial && projected !== null ? (
                <span>Día {dayOfMonth} de {daysInMonth} · proyección {fmtCOP(Math.round(projected / 1000) * 1000)}</span>
              ) : curDelta === null ? "Sin IVA" : (
                <span className="inline-flex items-center gap-1" style={{ color: curDelta >= 0 ? "var(--good)" : "var(--bad)" }}>
                  {curDelta >= 0 ? <IconTrendUp className="size-3.5" /> : <IconTrendDown className="size-3.5" />}
                  {fmtPct(curDelta)} vs. {fmtMonth(prevMonth!.month)}
                </span>
              )
            }
          />
          <StatCard
            label={`Margen bruto ${cur ? fmtMonth(cur.month) : ""}`}
            value={fmtPct(cur?.grossMargin ?? 0)}
            hint={`Meta mínima ${fmtPct(s.margenMinimo)}${closed.length ? ` · prom. 6 meses ${fmtPct(avgMargin)}` : ""}`}
            tone={(cur?.grossMargin ?? 0) < s.margenMinimo ? "bad" : "good"}
            icon={<IconTag className="size-4" />}
          />
          <StatCard
            label={`Utilidad bruta ${cur ? fmtMonth(cur.month) : ""}`}
            value={fmtCOP(cur?.grossProfit)}
            hint={closed.length ? `Promedio mensual ${fmtCOP(avgGross)}` : "Sin IVA"}
            icon={<IconTrendUp className="size-4" />}
          />
          <StatCard
            label={`Utilidad neta ${cur ? fmtMonth(cur.month) : ""}`}
            value={curNet === null ? "Faltan gastos" : fmtCOP(curNet)}
            tone={curNet === null ? undefined : curNet < 0 ? "bad" : "good"}
            hint={curNet === null ? <Link className="underline" href="/resultados">Cargar gastos del mes</Link> : isPartial ? "Con los gastos cargados hasta hoy" : "Después de gastos fijos"}
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
              href="/compras?vista=vencidas"
              icon={<IconReceipt />}
              done={Number(overdue?.n ?? 0) === 0}
              title={Number(overdue?.n ?? 0) === 0 ? "Pagos a proveedores al día" : `${overdue!.n} facturas vencidas por ${fmtCOP(Number(overdue!.saldo))}`}
              detail={Number(overdue?.n ?? 0) ? "Revísalas en Compras → Vencidas" : undefined}
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
          <QuickAction href="/vender" icon={<IconCart />} title="Vender" detail="Cobrar en el mostrador" />
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
