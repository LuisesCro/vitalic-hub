"use client";

import { useRef } from "react";
import { fmtCOP } from "@/lib/format";

export type TicketData = {
  title: string; // COTIZACIÓN, RECIBO DE VENTA, CIERRE DE CAJA…
  date: string; // texto ya formateado
  number?: string;
  rows?: { label: string; value: string }[]; // datos sueltos (cliente, cajero…)
  items?: { name: string; detail: string; total: number }[];
  totals?: { label: string; value: string; big?: boolean }[];
  footer?: string;
};

/**
 * Botón + tiquete de 80 mm. Al tocar imprime solo el tiquete por la impresora de recibos;
 * si en el controlador de la impresora está activado "abrir cajón", el cajón abre al imprimir.
 */
export function PrintTicket({ data, label = "Imprimir tiquete", className = "btn-secondary" }: { data: TicketData; label?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // Solo sale el tiquete del botón que se tocó, aunque haya varios en la pantalla.
  function print() {
    const el = ref.current;
    el?.classList.add("ticket-active");
    window.addEventListener("afterprint", () => el?.classList.remove("ticket-active"), { once: true });
    window.print();
  }
  return (
    <>
      <button type="button" onClick={print} className={className}>{label}</button>
      <div ref={ref} className="ticket-print" aria-hidden>
        <h1>VITALIC</h1>
        <p className="t-center">Frutos secos, especias y condimentos<br />Barrio Alameda · Cali<br />VITALIC SAS · NIT 901967570<br />@vitalic_market</p>
        <div className="t-line" />
        <p className="t-center t-big">{data.title}</p>
        <div className="t-row"><span>{data.date}</span>{data.number && <span>N.º {data.number}</span>}</div>
        {data.rows?.map((r) => <div key={r.label} className="t-row"><span>{r.label}</span><span>{r.value}</span></div>)}
        {data.items && data.items.length > 0 && <div className="t-line" />}
        {data.items?.map((i, n) => (
          <div key={n}>
            <div>{i.name}</div>
            <div className="t-row"><span>{i.detail}</span><span>{fmtCOP(i.total)}</span></div>
          </div>
        ))}
        {data.totals && <div className="t-line" />}
        {data.totals?.map((t) => <div key={t.label} className={`t-row ${t.big ? "t-big" : ""}`}><span>{t.label}</span><span>{t.value}</span></div>)}
        <div className="t-line" />
        <p className="t-center">{data.footer ?? "¡Gracias por tu compra!"}</p>
        <p className="t-center">Comprobante de control interno</p>
        <p className="t-center">www.vitalicmarket.com</p>
        <br /><br />
      </div>
    </>
  );
}
