import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashMovements, cashSessions, users } from "@/db/schema";
import { MOVEMENT_KINDS, PAYMENT_METHODS, differenceStatus, expectedCash, isMovementKind } from "@/lib/cash";
import { salesOfDay } from "@/lib/day-sales";
import { fmtCOP, fmtNum, todayISO } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { PrintReport } from "./print-button";

export const metadata = { title: "Cierre de caja · Vitalic Hub" };

const hhmm = (d: Date | null) => (d ? new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Bogota" }).format(d) : "—");
const fmtDay = (iso: string) => new Date(iso + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 break-inside-avoid">
      <h2 className="mb-1 border-b border-black/60 pb-1 text-center text-sm font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}
const Row = ({ label, value, bold }: { label: string; value: string; bold?: boolean }) => (
  <div className={`flex justify-between gap-3 py-0.5 text-sm ${bold ? "font-bold" : ""}`}><span>{label}</span><span className="tabular-nums">{value}</span></div>
);

export default async function CierrePage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const session = await requireSession();
  const { fecha } = await searchParams;
  const today = todayISO();
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= today ? fecha : today;

  const [cash] = await db.select().from(cashSessions).where(eq(cashSessions.businessDate, date));
  const moves = cash ? await db.select().from(cashMovements).where(eq(cashMovements.sessionId, cash.id)).orderBy(asc(cashMovements.createdAt)) : [];
  const people = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]));
  const day = await salesOfDay(date);

  const items = await db.execute<{ sku: string; name: string; qty: string; total: string }>(sql`
    select sku, max(product_name) as name, sum(quantity) as qty, sum(total) as total
    from sale_lines where not excluded and (sold_at at time zone 'America/Bogota')::date = ${date}
    group by sku, lower(product_name) order by max(product_name)`);
  const [{ n: salesCount }] = await db.execute<{ n: string }>(sql`
    select count(distinct invoice) as n from sale_lines where not excluded and (sold_at at time zone 'America/Bogota')::date = ${date}`);
  const taxes = await db.execute<{ rate: string; base: string; tax: string }>(sql`
    select round(tax / nullif(subtotal_net, 0) * 100)::int as rate, sum(subtotal_net) as base, sum(tax) as tax
    from sale_lines where not excluded and (sold_at at time zone 'America/Bogota')::date = ${date} group by 1 order by 1`);

  const payRows = PAYMENT_METHODS.map((m) => ({ label: m.label, value: day.byKey[m.key] ?? 0 })).filter((r) => r.value > 0);
  const totalSold = day.total;
  const incomes = moves.filter((m) => m.kind === "ingreso");
  const expenses = moves.filter((m) => m.kind === "egreso");
  const withdrawals = moves.filter((m) => m.kind === "retiro");
  const sum = (a: { amount: number }[]) => a.reduce((t, m) => t + m.amount, 0);
  const cashSales = cash?.status === "cerrada" ? cash.salesCash : day.byKey.salesCash ?? 0;
  const expected = cash ? expectedCash(cash.openingCash, cashSales, moves) : 0;
  const counted = cash?.countedCash ?? null;
  const diff = counted === null ? null : counted - expected;
  const status = diff === null ? null : differenceStatus(diff);

  return (
    <div className="mx-auto max-w-2xl bg-white p-4 text-black print:p-0 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2 print:hidden">
        <form className="flex items-end gap-2">
          <label><span className="label">Día</span><input type="date" name="fecha" defaultValue={date} max={today} className="input" /></label>
          <button className="btn-secondary">Ver</button>
        </form>
        <div className="flex gap-2">
          <Link href={`/caja?fecha=${date}`} className="btn-secondary">← Caja</Link>
          <PrintReport />
        </div>
      </div>

      <header className="text-center">
        <p className="text-base font-bold">VITALIC S.A.S</p>
        <p className="text-xs">NIT: 901967570-5</p>
        <p className="mt-1 text-sm font-bold">Cierre de caja · <span className="first-letter:uppercase">{fmtDay(date)}</span></p>
        {!cash ? (
          <p className="mt-1 text-xs">No se abrió caja este día; solo se muestran las ventas.</p>
        ) : (
          <>
            <p className="mt-1 text-xs">
              Apertura: <strong>{hhmm(cash.openedAt)}</strong> · Cierre: <strong>{cash.status === "cerrada" ? hhmm(cash.closedAt) : "sigue abierta"}</strong>
            </p>
            <p className="text-xs">
              Abrió: <strong>{people.get(cash.openedBy ?? 0) ?? "—"}</strong>{cash.status === "cerrada" && <> · Cerró: <strong>{people.get(cash.closedBy ?? 0) ?? "—"}</strong></>}
            </p>
          </>
        )}
        <p className="text-xs">Ventas del día: <strong>{salesCount}</strong> · Total: <strong>{fmtCOP(totalSold)}</strong></p>
        {cash && cash.status !== "cerrada" && <p className="mt-1 text-xs font-semibold" style={{ color: "var(--warn)" }}>Cierre parcial: la caja todavía está abierta.</p>}
      </header>

      <Section title="Productos">
        <table className="w-full text-xs">
          <thead><tr className="border-b border-black/30 text-left"><th className="py-1">Código</th><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Valor</th></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.sku + i.name} className="border-b border-black/10 align-top">
                <td className="max-w-[9rem] break-all py-0.5 pr-2">{i.sku === "SIN-CODIGO" ? "—" : i.sku}</td>
                <td className="pr-2">{i.name}</td>
                <td className="text-right tabular-nums">{fmtNum(Number(i.qty))}</td>
                <td className="text-right tabular-nums">{fmtCOP(Number(i.total))}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="py-2 text-center">Sin ventas.</td></tr>}
          </tbody>
          {items.length > 0 && <tfoot><tr className="font-bold"><td colSpan={3} className="pt-1">Total</td><td className="pt-1 text-right tabular-nums">{fmtCOP(items.reduce((t, i) => t + Number(i.total), 0))}</td></tr></tfoot>}
        </table>
      </Section>

      <Section title="Formas de pago">
        {payRows.map((r) => <Row key={r.label} label={r.label} value={fmtCOP(r.value)} />)}
        {day.mixed > 0 && <Row label="Pagos mixtos (sin detallar)" value={fmtCOP(day.mixed)} />}
        <Row label="Total" value={fmtCOP(totalSold)} bold />
      </Section>

      <Section title="Ingresos de efectivo">
        {incomes.length ? incomes.map((m) => <Row key={m.id} label={`${m.category}${m.note ? ` · ${m.note}` : ""}`} value={fmtCOP(m.amount)} />) : <Row label="Sin ingresos" value={fmtCOP(0)} />}
        <Row label="Total" value={fmtCOP(sum(incomes))} bold />
      </Section>

      <Section title="Gastos y pagos desde la caja">
        {expenses.length ? expenses.map((m) => <Row key={m.id} label={`${m.category}${m.note ? ` · ${m.note}` : ""}`} value={fmtCOP(m.amount)} />) : <Row label="Sin gastos" value={fmtCOP(0)} />}
        <Row label="Total" value={fmtCOP(sum(expenses))} bold />
      </Section>

      <Section title="Retiros y consignaciones">
        {withdrawals.length ? withdrawals.map((m) => <Row key={m.id} label={`${m.category}${m.note ? ` · ${m.note}` : ""}`} value={fmtCOP(m.amount)} />) : <Row label="Sin retiros" value={fmtCOP(0)} />}
        <Row label="Total" value={fmtCOP(sum(withdrawals))} bold />
      </Section>

      <Section title="Impuestos">
        {taxes.filter((t) => Number(t.tax) > 0).map((t) => <Row key={t.rate} label={`IVA ${t.rate} % (base ${fmtCOP(Number(t.base))})`} value={fmtCOP(Number(t.tax))} />)}
        {taxes.every((t) => Number(t.tax) <= 0) && <Row label="Sin impuestos" value={fmtCOP(0)} />}
      </Section>

      {cash && (
        <Section title="Arqueo de caja">
          <Row label="(+) Valor de apertura" value={fmtCOP(cash.openingCash)} />
          <Row label="(+) Ventas en efectivo" value={fmtCOP(cashSales)} />
          <Row label="(+) Ingresos de efectivo" value={fmtCOP(sum(incomes))} />
          <Row label="(−) Gastos y pagos desde la caja" value={fmtCOP(sum(expenses))} />
          <Row label="(−) Retiros y consignaciones" value={fmtCOP(sum(withdrawals))} />
          <div className="my-1 border-t border-black/40" />
          <Row label="Total operación (lo que debería haber)" value={fmtCOP(expected)} bold />
          <Row label="Efectivo contado por el cajero" value={counted === null ? "—" : fmtCOP(counted)} bold />
          <Row label="Diferencia" value={diff === null ? "—" : `${fmtCOP(diff)} · ${status}`} bold />
          {cash.status === "cerrada" && <Row label="Base que queda para el día siguiente" value={cash.nextBase === null ? "—" : fmtCOP(cash.nextBase)} />}
          {cash.closingNote && <p className="mt-1 text-xs">Nota: {cash.closingNote}</p>}
        </Section>
      )}

      <div className="mt-10 grid grid-cols-2 gap-8 text-center text-xs">
        <div className="border-t border-black pt-1">Firma de quien cierra</div>
        <div className="border-t border-black pt-1">Firma de quien revisa</div>
      </div>
      {session.role !== "admin" && <p className="mt-4 text-center text-xs print:hidden" style={{ color: "var(--muted)" }}>Este informe no incluye costos ni utilidad.</p>}
    </div>
  );
}
