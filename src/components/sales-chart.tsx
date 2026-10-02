import { fmtCOP, fmtMonth, fmtPct } from "@/lib/format";

type Point = { month: string; sales: number; grossMargin: number; partial?: boolean };

/**
 * Ventas por mes en barras (una sola serie, color de marca). Cada barra muestra su
 * detalle al pasar el dedo o el mouse; solo la última lleva el valor escrito.
 */
export function SalesChart({ points }: { points: Point[] }) {
  if (points.length === 0) return null;
  const max = Math.max(...points.map((p) => p.sales)) || 1;
  const short = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1).replace(".", ",")} M` : `${Math.round(v / 1000)} mil`);
  // Se rotula el último mes completo; el mes en curso va más claro y solo con su detalle al tocarlo.
  const labeled = points.findLastIndex((p) => !p.partial);
  const ticks = [max, max / 2];
  return (
    <div className="relative" role="img" aria-label="Ventas sin IVA por mes">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44">
        {ticks.map((t) => (
          <div key={t} className="absolute inset-x-0 border-t border-dashed border-[var(--border)]" style={{ top: `${(1 - t / max) * 100}%` }}>
            <span className="absolute -top-2.5 right-0 bg-[var(--surface)] pl-1 text-[10px] text-muted">{short(t)}</span>
          </div>
        ))}
      </div>
      <div className="relative flex h-44 items-end gap-[2px] border-b border-[var(--border)] pr-10 sm:gap-1">
        {points.map((p, i) => {
          const last = i === labeled;
          return (
            <div key={p.month} className="group relative flex h-full flex-1 items-end justify-center">
              <div
                className={`w-full max-w-9 rounded-t-[4px] transition-colors ${p.partial ? "bg-brand-200 dark:bg-brand-800" : "bg-brand-500 group-hover:bg-brand-700 dark:group-hover:bg-brand-200"}`}
                style={{ height: `${Math.max((p.sales / max) * 100, 1)}%` }}
              />
              {last && (
                <span className="absolute whitespace-nowrap text-[11px] font-semibold tabular-nums" style={{ bottom: `calc(${(p.sales / max) * 100}% + 4px)` }}>
                  {short(p.sales)}
                </span>
              )}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-max -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs shadow-lg group-hover:block">
                <p className="font-semibold first-letter:uppercase">{fmtMonth(p.month)}{p.partial ? " (en curso)" : ""}</p>
                <p className="tabular-nums">Ventas: {fmtCOP(p.sales)}</p>
                <p className="tabular-nums text-muted">Margen bruto: {fmtPct(p.grossMargin)}</p>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-[2px] pr-10 sm:gap-1">
        {points.map((p) => (
          <span key={p.month} className="flex-1 text-center text-[10px] text-muted first-letter:uppercase">{fmtMonth(p.month).slice(0, 3)}</span>
        ))}
      </div>
    </div>
  );
}
