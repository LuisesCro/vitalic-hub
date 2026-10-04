// Se muestra al instante mientras llega la pantalla: el clic nunca se siente congelado.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-label="Cargando">
      <div className="space-y-2">
        <div className="h-4 w-32 rounded bg-[var(--surface-2)]" />
        <div className="h-8 w-64 rounded-lg bg-[var(--surface-2)]" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-24" />)}
      </div>
      <div className="card h-64" />
    </div>
  );
}
