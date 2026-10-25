import Link from "next/link";
import type { StockAlert } from "@/lib/stock-alerts";

const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });
const when = (a: StockAlert) => (a.level === "agotado" ? "Agotado" : a.days === null ? `Quedan ${fmt(a.stock)} ${a.unit}` : a.days < 1 ? "Alcanza para menos de 1 día" : `Alcanza para ~${Math.round(a.days)} ${Math.round(a.days) === 1 ? "día" : "días"}`);

/** Lista de lo que se está acabando. `limit` recorta; `href` lleva a donde se resuelve (empacar, pedir). */
export function StockAlerts({ alerts, limit = 8, title = "Se está acabando", compact = false }: { alerts: StockAlert[]; limit?: number; title?: string; compact?: boolean }) {
  if (alerts.length === 0) return null;
  const out = alerts.filter((a) => a.level === "agotado").length;
  const shown = alerts.slice(0, limit);
  return (
    <section className="rounded-xl border-2 p-3" style={{ borderColor: out ? "var(--bad)" : "var(--warn)", background: out ? "var(--bad-bg)" : "var(--warn-bg, #fdf1d6)" }} role="alert">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold" style={{ color: out ? "var(--bad)" : "var(--warn)" }}>
          {title}: {alerts.length} {alerts.length === 1 ? "producto" : "productos"}{out ? ` (${out} ${out === 1 ? "agotado" : "agotados"})` : ""}
        </h2>
        {!compact && <Link href="/inventario" className="text-sm underline">Ver inventario</Link>}
      </div>
      <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {shown.map((a) => (
          <li key={`${a.kind}-${a.id}`} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate"><span className="font-medium">{a.name}</span> <span className="text-xs text-muted">{a.kind === "insumo" ? "insumo" : "bolsas"}</span></span>
            <span className="shrink-0 text-xs font-semibold" style={{ color: a.level === "agotado" ? "var(--bad)" : "var(--warn)" }}>{when(a)}</span>
          </li>
        ))}
      </ul>
      {alerts.length > shown.length && <p className="mt-1 text-xs text-muted">y {alerts.length - shown.length} más…</p>}
    </section>
  );
}
