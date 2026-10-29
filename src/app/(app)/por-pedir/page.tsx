import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { restockRequests, users } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { requireSession } from "@/lib/session";
import { stockAlerts, type StockAlert } from "@/lib/stock-alerts";
import { markOrdered, toggleUrgent } from "./actions";

export const metadata = { title: "Lo que se acaba · Vitalic Hub" };

const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: 1 });
const when = (a: StockAlert) => (a.level === "agotado" ? "Agotado" : a.days === null ? `Quedan ${fmt(a.stock)} ${a.unit}` : a.days < 1 ? "Menos de 1 día" : `~${Math.round(a.days)} ${Math.round(a.days) === 1 ? "día" : "días"}`);
const stamp = (d: Date) => d.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" });

export default async function PorPedirPage() {
  const session = await requireSession();
  const isAdmin = session.role === "admin";
  const alerts = await stockAlerts({ insumos: true });
  const pending = await db
    .select({ r: restockRequests, by: users.name })
    .from(restockRequests)
    .leftJoin(users, eq(restockRequests.requestedBy, users.id))
    .where(eq(restockRequests.status, "pendiente"))
    .orderBy(desc(restockRequests.id));
  const marked = new Set(pending.map((p) => `${p.r.kind}-${p.r.refId}`));
  const red = alerts.filter((a) => a.level === "agotado");
  const rest = alerts.filter((a) => a.level !== "agotado");

  const Row = ({ a }: { a: StockAlert }) => {
    const on = marked.has(`${a.kind}-${a.id}`);
    return (
      <li className="flex items-center justify-between gap-3 py-2">
        <span className="min-w-0">
          <span className="block truncate font-medium">{a.name}</span>
          <span className="text-xs text-muted">{a.kind === "insumo" ? "insumo" : "bolsas"} · <span style={{ color: a.level === "agotado" ? "var(--bad)" : "var(--warn)" }} className="font-semibold">{when(a)}</span></span>
        </span>
        <form action={toggleUrgent}>
          <input type="hidden" name="kind" value={a.kind} />
          <input type="hidden" name="refId" value={a.id} />
          <input type="hidden" name="name" value={a.name} />
          <button className={on ? "btn-primary" : "btn-secondary"}>{on ? "✓ Urgente" : "Marcar urgente"}</button>
        </form>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Lo que se acaba" subtitle={isAdmin ? "Lo que marcó la cajera como urgente y todo lo que se está agotando." : "Marca lo más urgente de pedir. Luis lo ve de inmediato."} />

      <section className="card">
        <h2 className="mb-2 font-semibold">Marcado como urgente ({pending.length})</h2>
        {pending.length === 0 ? <p className="text-sm text-muted">Nada marcado todavía.</p> : (
          <ul className="divide-y divide-[var(--border)]">
            {pending.map(({ r, by }) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.name}</span>
                  <span className="text-xs text-muted">{r.kind === "insumo" ? "insumo" : "bolsas"} · lo marcó {by ?? "—"} · {stamp(r.createdAt)}</span>
                </span>
                {isAdmin && <form action={markOrdered}><input type="hidden" name="id" value={r.id} /><button className="btn-primary">Ya lo pedí</button></form>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card rounded-xl border-2" style={{ borderColor: "var(--bad)" }}>
        <h2 className="mb-1 font-semibold" style={{ color: "var(--bad)" }}>Agotado ({red.length})</h2>
        {red.length === 0 ? <p className="text-sm text-muted">No hay nada agotado.</p> : <ul className="divide-y divide-[var(--border)]">{red.map((a) => <Row key={`${a.kind}-${a.id}`} a={a} />)}</ul>}
      </section>

      <section className="card">
        <h2 className="mb-1 font-semibold">Se está acabando ({rest.length})</h2>
        {rest.length === 0 ? <p className="text-sm text-muted">Nada por agotarse.</p> : <ul className="divide-y divide-[var(--border)]">{rest.map((a) => <Row key={`${a.kind}-${a.id}`} a={a} />)}</ul>}
      </section>
    </div>
  );
}
