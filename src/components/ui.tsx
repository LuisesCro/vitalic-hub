import Link from "next/link";
import { IconArrowRight, IconCheck } from "./icons";

/** Encabezado de cada pantalla: título, explicación corta y acciones a la derecha. */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1>{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function StatCard({
  label, value, hint, tone, icon,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: "good" | "bad";
  icon?: React.ReactNode;
}) {
  return (
    <div className="card min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">{label}</p>
        {icon && <span className="hidden size-8 shrink-0 place-items-center sm:grid rounded-lg bg-brand-50 text-brand-700 dark:bg-white/5 dark:text-brand-500">{icon}</span>}
      </div>
      <p
        className="mt-1 truncate text-lg font-bold tracking-tight tabular-nums sm:text-2xl"
        style={tone ? { color: tone === "good" ? "var(--good)" : "var(--bad)" } : undefined}
      >
        {value}
      </p>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Fila de "Pendientes de hoy": se ve resuelta (check verde) o como tarea con flecha. */
export function TodoRow({
  href, done, title, detail, icon,
}: {
  href: string;
  done: boolean;
  title: string;
  detail?: string;
  icon: React.ReactNode;
}) {
  return (
    <Link href={href} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-[var(--surface-2)]">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-lg"
        style={done ? { background: "var(--good-bg)", color: "var(--good)" } : { background: "var(--warn-bg)", color: "var(--warn)" }}
      >
        {done ? <IconCheck /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] ${done ? "text-muted" : "font-medium"}`}>{title}</span>
        {detail && <span className="block truncate text-xs text-muted">{detail}</span>}
      </span>
      <IconArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <p className="max-w-md text-sm text-muted">{children}</p>}
      {action}
    </div>
  );
}
