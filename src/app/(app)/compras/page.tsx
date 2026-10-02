import { requireAdmin } from "@/lib/session";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { purchases, suppliers } from "@/db/schema";
import { UploadForm } from "@/components/upload-form";
import { fmtCOP } from "@/lib/format";
import { uploadInvoice } from "./actions";

export const metadata = { title: "Compras · Vitalic Hub" };

export default async function ComprasPage() {
  await requireAdmin();
  const rows = await db
    .select({
      id: purchases.id,
      number: purchases.invoiceNumber,
      date: purchases.issueDate,
      total: purchases.total,
      status: purchases.status,
      source: purchases.source,
      supplier: suppliers.name,
    })
    .from(purchases)
    .leftJoin(suppliers, eq(purchases.supplierId, suppliers.id))
    .orderBy(desc(purchases.createdAt))
    .limit(100);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Compras a proveedores</h1>
      <section className="card space-y-2">
        <h2 className="font-semibold">Cargar una factura</h2>
        <p className="text-sm text-muted">
          Mejor opción: el .zip o .xml de la factura electrónica que llega al correo. También puedes subir una foto
          o un PDF y la IA lee los productos. Siempre revisas antes de que entre al inventario.
        </p>
        <UploadForm action={uploadInvoice} accept=".xml,.zip,.pdf,image/*" button="Leer factura" />
      </section>
      <section className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr><th>#</th><th>Proveedor</th><th>Factura</th><th>Fecha</th><th className="text-right">Total</th><th>Estado</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link className="underline" href={`/compras/${r.id}`}>{r.id}</Link></td>
                <td>{r.supplier ?? "—"}</td>
                <td>{r.number ?? "—"}</td>
                <td>{r.date ?? "—"}</td>
                <td className="text-right">{fmtCOP(r.total)}</td>
                <td>
                  <span className={r.status === "confirmada" ? "text-green-700 dark:text-green-400" : "text-amber-600"}>
                    {r.status === "confirmada" ? "Confirmada" : "Por revisar"}
                  </span>
                  {r.source === "foto" && <span className="ml-1 text-xs text-muted">(foto)</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="text-muted">Aún no hay facturas cargadas.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
