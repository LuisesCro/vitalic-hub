"use client";

export function PrintReport() {
  return <button type="button" onClick={() => window.print()} className="btn-primary">Imprimir el cierre</button>;
}
