import { AppShell } from "@/components/nav";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { restockRequests } from "@/db/schema";
import { requireSession } from "@/lib/session";
import { logout } from "../login/actions";

// Todas las páginas internas leen la base de datos: se generan en cada visita, nunca al compilar.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const urgent = session.role === "admin"
    ? Number((await db.select({ n: sql<number>`count(*)` }).from(restockRequests).where(eq(restockRequests.status, "pendiente")))[0]?.n ?? 0)
    : 0;
  return (
    <AppShell name={session.name} role={session.role} logout={logout} urgent={urgent}>
      {children}
    </AppShell>
  );
}
