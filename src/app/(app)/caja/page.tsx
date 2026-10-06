import Link from "next/link";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cashMovements, cashSessions, posSales, saleLines, users } from "@/db/schema";
import { excludeSaleLine } from "../importar/actions";
import { CASH_COLUMN, isPosMethod } from "@/lib/pos";
import {
  MOVEMENT_KINDS, PAYMENT_METHODS, differenceStatus, expectedCash, totalSales, vendtyMethodKey,
  type MovementKind, type PaymentKey, type SalesByMethod,
} from "@/lib/cash";
import { fmtCOP, todayISO } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { PrintTicket } from "@/components/ticket";
import { CloseForm } from "./close-form";
import { addCashMovement, deleteCash, deleteCashMovement, openCash, reopenCash } from "./actions";

export const metadata = { title: "Caja · Vitalic Hub" };

type Session = typeof cashSessions.$inferSelect;

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** Ventas importadas de Vendty para ese día, por medio de pago (con IVA). */
async function vendtyDay(date: string) {
  const rows = await db
    .select({ method: saleLines.paymentMethod, total: sql<number>`sum(${saleLines.total})`.mapWith(Number) })
    .from(saleLines)
    .where(sql`(${saleLines.soldAt} at time zone 'America/Bogota')::date = ${date} and not ${saleLines.excluded} and ${saleLines.invoice} not like 'V-%'`)
    .groupBy(saleLines.paymentMethod);
  const byKey: Partial<Record<PaymentKey, number>> = {};
  let mixed = 0;
  for (const r of rows) {
    const key = vendtyMethodKey(r.method);
    if (key) byKey[key] = (byKey[key] ?? 0) + r.total;
    else mixed += r.total;
  }
  let total = rows.reduce((t, r) => t + r.total, 0);
  // Ventas de la caja de Vitalic Hub: traen el valor exacto de cada medio, también en pagos mixtos.
  const hub = await db.select({ payments: posSales.payments, total: posSales.total }).from(posSales).where(sql`${posSales.businessDate} = ${date} and ${posSales.status} = 'vigente'`);
  for (const s of hub) {
    total += s.total;
    for (const p of JSON.parse(s.payments) as { method: string; amount: number }[]) {
      if (!isPosMethod(p.method)) continue;
      const key = CASH_COLUMN[p.method] as PaymentKey;
      byKey[key] = (byKey[key] ?? 0) + p.amount;
    }
  }
  return { byKey, mixed, total };
}

export default async function CajaPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const session = await requireSession();
  const { fecha } = await searchParams;
  const today = todayISO();
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= today ? fecha : today;

  const [[current], history, people, vendty] = await Promise.all([
    db.select().from(cashSessions).where(eq(cashSessions.businessDate, date)),
    db.select().from(cashSessions).orderBy(desc(cashSessions.businessDate)).limit(31),
    db.select({ id: users.id, name: users.name }).from(users),
    vendtyDay(date),
  ]);
  const names = new Map(people.map((u) => [u.id, u.name]));
  const movements = current
    ? await db.select().from(cashMovements).where(eq(cashMovements.sessionId, current.id)).orderBy(asc(cashMovements.createdAt))
    : [];
  const historyIds = history.map((h) => h.id);
  const allMovements = historyIds.length
    ? await db.select({ sessionId: cashMovements.sessionId, kind: cashMovements.kind, amount: cashMovements.amount })
        .from(cashMovements).where(inArray(cashMovements.sessionId, historyIds))
    : [];
  const movementsBySession = new Map<number, typeof allMovements>();
  for (const m of allMovements) movementsBySession.set(m.sessionId, [...(movementsBySession.get(m.sessionId) ?? []), m]);
  const lastClosed = history.find((h) => h.status === "cerrada" && h.businessDate < date);

  // Ventas importadas (no de la caja de Hub) de ese día, para que el administrador las revise o excluya.
  const imported = session.role === "admin"
    ? await db
        .select({ id: saleLines.id, invoice: saleLines.invoice, name: saleLines.productName, qty: saleLines.quantity, total: saleLines.total })
        .from(saleLines)
        .where(sql`(${saleLines.soldAt} at time zone 'America/Bogota')::date = ${date} and not ${saleLines.excluded} and ${saleLines.invoice} not like 'V-%'`)
        .orderBy(asc(saleLines.invoice), asc(saleLines.id))
        .limit(200)
    : [];

  const month = today.slice(0, 7);
  const monthClosed = history.filter((h) => h.status === "cerrada" && h.businessDate.startsWith(month));
  const monthDiff = monthClosed.reduce((t, h) => t + diffOf(h, movementsBySession.get(h.id) ?? []), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Caja</h1>
          <p className="text-sm text-muted first-letter:uppercase">{fmtDay(date)}{date === today ? " · hoy" : ""}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
        <Link href="/caja/cotizar" className="btn-primary">Cotizar por kilo o bulto</Link>
        <form className="flex items-end gap-2">
          <label><span className="label">Ver otro día</span><input type="date" name="fecha" defaultValue={date} max={today} className="input" /></label>
          <button className="btn-secondary">Ver</button>
        </form>
        </div>
      </div>

      {!current && (
        <section className="card space-y-3">
          <h2 className="font-semibold">Abrir caja</h2>
          <p className="text-sm text-muted">Cuenta el efectivo con el que empieza el día (la base) y ábrela.</p>
          <form action={openCash} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="date" value={date} />
            <label>
              <span className="label">Base en efectivo</span>
              <input name="openingCash" inputMode="numeric" required className="input" defaultValue={lastClosed?.nextBase ?? ""} placeholder="0" />
            </label>
            <button className="btn-primary">Abrir caja</button>
          </form>
          {lastClosed?.nextBase != null && (
            <p className="text-sm text-muted">Sugerida: la base que quedó el {lastClosed.businessDate} ({fmtCOP(lastClosed.nextBase)}).</p>
          )}
        </section>
      )}

      {current && (
        <>
          <section className="card space-y-2">
            {session.role === "admin" && (
              <details className="float-right text-sm">
                <summary className="cursor-pointer text-muted underline">Borrar esta caja</summary>
                <form action={deleteCash} className="mt-2 space-y-2 rounded-lg p-3" style={{ background: "var(--bad-bg)" }}>
                  <input type="hidden" name="id" value={current.id} />
                  <p>Se borra la apertura, los movimientos y el cierre de este día. Úsalo solo para pruebas o errores.</p>
                  <button className="btn-secondary" style={{ color: "var(--bad)" }}>Sí, borrar la caja del {current.businessDate}</button>
                </form>
              </details>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">
                Caja {current.status === "abierta" ? <span className="text-green-700 dark:text-green-400">abierta</span> : "cerrada"}
              </h2>
              <p className="text-sm text-muted">
                Abrió {names.get(current.openedBy ?? 0) ?? "—"} con base de <strong>{fmtCOP(current.openingCash)}</strong>
              </p>
            </div>
          </section>

          <section className="card space-y-3">
            <h2 className="font-semibold">Movimientos de efectivo</h2>
            <p className="text-sm text-muted">Todo lo que entra o sale del cajón y no es una venta: pagos a proveedores, gastos, consignaciones, retiros.</p>
            {movements.length > 0 && (
              <ul className="divide-y divide-[var(--border)] text-sm">
                {movements.map((m) => {
                  const k = MOVEMENT_KINDS[m.kind as MovementKind];
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                      <div className="min-w-0">
                        <p className="font-medium">{m.category}</p>
                        <p className="truncate text-muted">{[k?.label, m.note, names.get(m.createdBy ?? 0)].filter(Boolean).join(" · ")}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`whitespace-nowrap ${k?.sign === 1 ? "text-green-700 dark:text-green-400" : "text-red-600"}`}>
                          {k?.sign === 1 ? "+" : "−"}{fmtCOP(m.amount)}
                        </span>
                        {current.status === "abierta" && (
                          <form action={deleteCashMovement}>
                            <input type="hidden" name="id" value={m.id} />
                            <button className="text-xs text-muted underline">Borrar</button>
                          </form>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {current.status === "abierta" && <MovementForm sessionId={current.id} />}
          </section>

          {current.status === "abierta" ? (
            <section className="card">
              <h2 className="mb-3 text-lg font-semibold">Cerrar caja</h2>
              {vendty.total > 0 && (
                <p className="mb-3 text-sm text-muted">
                  Prellené las ventas con lo registrado en Vitalic Hub (y lo importado de Vendty) para este día ({fmtCOP(vendty.total)}).
                  {vendty.mixed > 0 && ` Hay ${fmtCOP(vendty.mixed)} en pagos mixtos: repártelos a mano.`} Revisa contra el cierre de Vendty.
                </p>
              )}
              <CloseForm
                sessionId={current.id}
                openingCash={current.openingCash}
                movementsNet={expectedCash(0, 0, movements)}
                suggested={vendty.byKey}
              />
            </section>
          ) : (
            <ClosedSummary canReopen={session.role === "admin"} s={current} movements={movements} closedBy={names.get(current.closedBy ?? 0)} vendty={vendty} />
          )}
        </>
      )}

      {imported.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">Ventas importadas de este día ({imported.length} líneas · {fmtCOP(imported.reduce((t, l) => t + l.total, 0))})</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Factura / cierre</th><th>Producto</th><th className="text-right">Cant.</th><th className="text-right">Total</th><th /></tr></thead>
              <tbody>
                {imported.map((l) => (
                  <tr key={l.id}>
                    <td>{l.invoice}</td><td>{l.name}</td><td className="text-right">{l.qty.toLocaleString("es-CO")}</td><td className="text-right">{fmtCOP(l.total)}</td>
                    <td>
                      <form action={excludeSaleLine}><input type="hidden" name="id" value={l.id} /><button className="text-xs text-muted underline">Excluir</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      <section className="card overflow-x-auto">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Últimos cierres</h2>
          {monthClosed.length > 0 && (
            <p className="text-sm">
              Diferencia acumulada del mes ({monthClosed.length} cierres):{" "}
              <strong className={monthDiff < 0 ? "text-red-600" : ""}>{fmtCOP(monthDiff)}</strong>
            </p>
          )}
        </div>
        <table className="table-base">
          <thead>
            <tr><th>Día</th><th>Estado</th><th className="text-right">Ventas</th><th className="text-right">Debería haber</th><th className="text-right">Contado</th><th className="text-right">Diferencia</th></tr>
          </thead>
          <tbody>
            {history.map((h) => {
              const mv = movementsBySession.get(h.id) ?? [];
              const exp = expectedCash(h.openingCash, h.salesCash, mv);
              const diff = h.status === "cerrada" ? diffOf(h, mv) : null;
              const st = diff === null ? null : differenceStatus(diff);
              return (
                <tr key={h.id}>
                  <td><Link className="underline" href={`/caja?fecha=${h.businessDate}`}>{h.businessDate}</Link></td>
                  <td>{h.status}</td>
                  <td className="text-right">{h.status === "cerrada" ? fmtCOP(totalSales(h)) : "—"}</td>
                  <td className="text-right">{h.status === "cerrada" ? fmtCOP(exp) : "—"}</td>
                  <td className="text-right">{fmtCOP(h.countedCash)}</td>
                  <td className={`text-right font-semibold ${st === "falta" ? "text-red-600" : st === "sobra" ? "text-amber-600" : st === "cuadra" ? "text-green-700 dark:text-green-400" : ""}`}>
                    {diff === null ? "—" : fmtCOP(diff)}
                  </td>
                </tr>
              );
            })}
            {history.length === 0 && <tr><td colSpan={6} className="text-muted">Aún no hay cierres.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function diffOf(s: Session, movements: { kind: string; amount: number }[]) {
  return (s.countedCash ?? 0) - expectedCash(s.openingCash, s.salesCash, movements);
}

function MovementForm({ sessionId }: { sessionId: number }) {
  return (
    <form action={addCashMovement} className="grid gap-3 sm:grid-cols-5">
      <input type="hidden" name="sessionId" value={sessionId} />
      <label className="sm:col-span-2">
        <span className="label">Concepto</span>
        <select name="category" className="input">
          {(Object.keys(MOVEMENT_KINDS) as MovementKind[]).map((kind) => (
            <optgroup key={kind} label={MOVEMENT_KINDS[kind].label}>
              {MOVEMENT_KINDS[kind].categories.map((c) => <option key={c} value={`${kind}|${c}`}>{c}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label><span className="label">Valor</span><input name="amount" inputMode="numeric" required className="input" placeholder="0" /></label>
      <label><span className="label">Detalle</span><input name="note" className="input" placeholder="Ej.: 3A, factura 1234" /></label>
      <div className="flex items-end"><button className="btn-secondary w-full">Agregar</button></div>
    </form>
  );
}

function ClosedSummary({
  s, movements, closedBy, vendty, canReopen,
}: {
  canReopen: boolean;
  s: Session;
  movements: { kind: string; amount: number }[];
  closedBy?: string;
  vendty: Awaited<ReturnType<typeof vendtyDay>>;
}) {
  const expected = expectedCash(s.openingCash, s.salesCash, movements);
  const diff = (s.countedCash ?? 0) - expected;
  const status = differenceStatus(diff);
  const sales: SalesByMethod = s;
  return (
    <section className="card space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total vendido" value={fmtCOP(totalSales(sales))} />
        <Stat label="Debería haber" value={fmtCOP(expected)} />
        <Stat label="Contado" value={fmtCOP(s.countedCash)} />
        <Stat
          label="Diferencia"
          value={`${fmtCOP(diff)} · ${status}`}
          tone={status === "falta" ? "text-red-600" : status === "sobra" ? "text-amber-600" : "text-green-700 dark:text-green-400"}
        />
      </div>
      <table className="table-base">
        <thead><tr><th>Medio de pago</th><th className="text-right">Registrado</th>{vendty.total > 0 && <th className="text-right">Según Vendty</th>}</tr></thead>
        <tbody>
          {PAYMENT_METHODS.map((m) => (
            <tr key={m.key}>
              <td>{m.label}</td><td className="text-right">{fmtCOP(s[m.key])}</td>
              {vendty.total > 0 && <td className="text-right text-muted">{fmtCOP(vendty.byKey[m.key] ?? 0)}</td>}
            </tr>
          ))}
          {vendty.mixed > 0 && <tr><td>Pagos mixtos en Vendty</td><td /><td className="text-right text-muted">{fmtCOP(vendty.mixed)}</td></tr>}
        </tbody>
      </table>
      <p className="text-sm text-muted">
        Cerró {closedBy ?? "—"}. Base para el día siguiente: {fmtCOP(s.nextBase)}.{s.closingNote ? ` Nota: ${s.closingNote}` : ""}
      </p>
      <PrintTicket
        label="Imprimir cierre de caja"
        data={{
          title: "CIERRE DE CAJA",
          date: new Date(s.businessDate + "T12:00:00").toLocaleDateString("es-CO"),
          rows: [{ label: "Cerró", value: closedBy ?? "—" }, { label: "Base inicial", value: fmtCOP(s.openingCash) }],
          items: PAYMENT_METHODS.filter((m) => s[m.key] > 0).map((m) => ({ name: m.label, detail: "", total: s[m.key] })),
          totals: [
            { label: "Total vendido", value: fmtCOP(totalSales(sales)), big: true },
            { label: "Debería haber", value: fmtCOP(expected) },
            { label: "Contado", value: fmtCOP(s.countedCash) },
            { label: "Diferencia", value: `${fmtCOP(diff)} ${status}`, big: true },
            { label: "Base para mañana", value: fmtCOP(s.nextBase) },
          ],
          footer: "Firma: ____________________",
        }}
      />
      {canReopen ? (
        <form action={reopenCash}>
          <input type="hidden" name="id" value={s.id} />
          <button className="btn-secondary">Reabrir para corregir</button>
        </form>
      ) : (
        <p className="text-sm text-muted">Si hay que corregir algo, avísale a Luis o a Paula para que reabran la caja.</p>
      )}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className={`font-semibold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}
