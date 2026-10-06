"use client";

import { useRef } from "react";
import { BUSINESS as B } from "@/lib/business";
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

const TICKET_CSS = `
  html, body { margin: 0; padding: 0; background: #fff; }
  .ticket { width: 72mm; padding: 4mm; box-sizing: content-box; color: #000; font-family: "Courier New", ui-monospace, monospace; font-size: 11px; line-height: 1.35; }
  .ticket img.t-logo { display: block; width: 46px; height: 46px; margin: 0 auto 3px; }
  .ticket h1 { font-family: Arial, Helvetica, sans-serif; font-size: 16px; text-align: center; margin: 0; }
  .ticket p { margin: 0; }
  .ticket .t-center { text-align: center; }
  .ticket .t-row { display: flex; justify-content: space-between; gap: 6px; }
  .ticket .t-line { border-top: 1px dashed #000; margin: 5px 0; }
  .ticket .t-big { font-size: 14px; font-weight: 700; }
`;

/**
 * Botón + tiquete de 80 mm. Al tocar imprime solo el tiquete por la impresora de recibos;
 * si en el controlador de la impresora está activado "abrir cajón", el cajón abre al imprimir.
 */
export function PrintTicket({ data, label = "Imprimir tiquete", className = "btn-secondary", id }: { data: TicketData; label?: string; className?: string; id?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // El recibo se imprime en un documento aparte (iframe) con la altura exacta del recibo:
  // así Chrome no manda a imprimir toda la pantalla del sistema ni deja papel en blanco.
  function print() {
    const el = ref.current;
    if (!el) return;
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-9999px;top:0;width:80mm;height:10px;border:0;";
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) { frame.remove(); return; }
    const logo = `${window.location.origin}/brand/vitalic-icono-negro.svg`;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo</title><style>${TICKET_CSS}</style></head><body><div class="ticket">${el.innerHTML.replace(/src="[^"]*vitalic-icono-negro\.svg"/, `src="${logo}"`)}</div></body></html>`);
    doc.close();
    const clean = () => setTimeout(() => frame.remove(), 500);
    const go = () => {
      // Alto del recibo en mm (+ un poco de margen para que el cortador no se coma la última línea).
      const heightMm = Math.ceil((doc.body.scrollHeight * 25.4) / 96) + 6;
      const page = doc.createElement("style");
      page.textContent = `@page { size: 80mm ${heightMm}mm; margin: 0; }`;
      doc.head.appendChild(page);
      win.addEventListener("afterprint", clean, { once: true });
      win.focus();
      win.print();
      setTimeout(() => frame.remove(), 60000); // por si el navegador nunca avisa
    };
    const img = doc.querySelector("img");
    if (img && !img.complete) { img.addEventListener("load", go, { once: true }); img.addEventListener("error", go, { once: true }); }
    else go();
  }
  return (
    <>
      <button type="button" id={id} onClick={print} className={className}>{label}</button>
      <div ref={ref} className="ticket-print" aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/vitalic-icono-negro.svg" alt="" className="t-logo" />
        <h1>{B.name}</h1>
        <p className="t-center">
          NIT: {B.nit}<br />
          {B.address} · {B.city}<br />
          Tel: {B.phone}<br />
          {B.email}<br />
          Instagram: {B.instagram}
        </p>
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
        <br /><br />
      </div>
    </>
  );
}
