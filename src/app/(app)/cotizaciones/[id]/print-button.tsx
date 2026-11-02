"use client";

export function PrintQuote() {
  return <button type="button" onClick={() => window.print()} className="btn-primary">Imprimir o guardar PDF</button>;
}
