import { Nav } from "@/components/nav";
import { requireSession } from "@/lib/session";
import { logout } from "../login/actions";

// Todas las páginas internas leen la base de datos: se generan en cada visita, nunca al compilar.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-[var(--border)] bg-[var(--bg)]/95 px-4 pt-3 backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-lg font-semibold text-brand-700 dark:text-brand-500">Vitalic Hub</span>
          <form action={logout} className="flex items-center gap-3 text-sm">
            <span className="text-muted">{session.name}</span>
            <button className="underline">Salir</button>
          </form>
        </div>
        <Nav role={session.role} />
      </header>
      {children}
    </div>
  );
}
