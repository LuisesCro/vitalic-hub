import { requireSession } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import { recentPhotos } from "./actions";
import { PhotoForm } from "./photo-form";

export const metadata = { title: "Fotos de facturas · Vitalic Hub" };

const LABEL: Record<string, string> = { pendiente: "Pendiente", cargada: "Cargada", descartada: "Descartada" };

export default async function FacturasPage() {
  const session = await requireSession();
  const mine = await recentPhotos(session.role === "admin" ? null : session.userId);
  return (
    <div className="space-y-4">
      <PageHeader title="Fotos de facturas" subtitle="Cuando llegue un pedido, toma la foto de la factura del proveedor" />
      <section className="card space-y-2">
        <PhotoForm />
        <p className="text-xs text-muted">Una foto por hoja. Que se vea completa, derecha y sin sombras. Si la factura tiene dos hojas, envía cada una por separado.</p>
      </section>
      <section className="card">
        <h2 className="mb-2 font-semibold">Enviadas</h2>
        {mine.length === 0 ? <p className="text-sm text-muted">Aún no hay facturas enviadas.</p> : (
          <ul className="divide-y divide-[var(--border)] text-sm">
            {mine.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span>{p.createdAt.toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short" })}{p.note ? ` · ${p.note}` : ""}</span>
                <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: p.status === "cargada" ? "var(--good-bg)" : "var(--surface-2)" }}>{LABEL[p.status] ?? p.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
