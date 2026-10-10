import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { fmtCOP, fmtNum, fmtPct, todayISO } from "@/lib/format";
import { dayProductProfit } from "@/lib/reports";
import { requireAdmin } from "@/lib/session";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Utilidad del día · Vitalic Hub" };

export default async function UtilidadDiaPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  await requireAdmin();
  const { fecha } = await searchParams;
  const today = todayISO();
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= today ? fecha : today;
  const s = await getSettings();
  const rows = await dayProductProfit(date);
  const withCost = rows.filter((r) => r.margin !== null);
  const noCost = rows.filter((r) => r.margin === null);
  const low = withCost.filter((r) => (r.margin ?? 1) < s.margenMinimo);
  const lostVsMin = low.reduce((t, r) => t + (s.margenMinimo - (r.margin ?? 0)) * r.sales, 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Utilidad del día por producto" subtitle={`Productos de menor a mayor margen. Meta mínima: ${fmtPct(s.margenMinimo)}.`}>
        <form className="flex items-end gap-2">
          <label><span className="label">Día</span><input type="date" name="fecha" defaultValue={date} max={today} className="input" /></label>
          <button className="btn-secondary">Ver</button>
        </form>
      </PageHeader>
      <p className="text-sm text-muted">
        {low.length} producto{low.length === 1 ? "" : "s"} por debajo de la meta{low.length ? ` (dejaron unos ${fmtCOP(Math.round(lostVsMin))} menos de lo esperado con el 40 %)` : ""}; {noCost.length} sin costo cargado.
        Todo sin IVA. <Link href="/" className="underline">← Inicio</Link>
      </p>
      <section className="card overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Producto</th><th className="text-right">Unid.</th><th className="text-right">Ventas</th><th className="text-right">Costo</th><th className="text-right">Utilidad</th><th className="text-right">Margen</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sku + r.name}>
                <td>{r.name}</td>
                <td className="text-right tabular-nums">{fmtNum(r.units)}</td>
                <td className="text-right tabular-nums">{fmtCOP(Math.round(r.sales))}</td>
                <td className="text-right tabular-nums">{r.cost === null ? "sin costo" : fmtCOP(Math.round(r.cost))}</td>
                <td className="text-right tabular-nums">{r.profit === null ? "—" : fmtCOP(Math.round(r.profit))}</td>
                <td className="text-right font-semibold tabular-nums" style={{ color: r.margin === null ? undefined : r.margin < s.margenMinimo ? "var(--bad)" : "var(--good)" }}>{fmtPct(r.margin)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="text-muted">No hay ventas ese día.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
