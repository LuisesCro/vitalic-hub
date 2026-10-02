import { AppShell } from "@/components/nav";
import { requireSession } from "@/lib/session";
import { logout } from "../login/actions";

// Todas las páginas internas leen la base de datos: se generan en cada visita, nunca al compilar.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  return (
    <AppShell name={session.name} role={session.role} logout={logout}>
      {children}
    </AppShell>
  );
}
