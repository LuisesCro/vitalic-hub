"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  IconBag, IconBox, IconLayers, IconScale, IconCart, IconCash, IconChart, IconHome, IconKey, IconLeaf, IconLogout, IconMenu, IconReceipt,
  IconSettings, IconTag, IconUpload, IconX, BrandLogo,
} from "./icons";

type Item = { href: string; label: string; icon: (p: { className?: string }) => React.ReactNode; hint?: string };
type Group = { title: string; items: Item[] };

const ADMIN: Group[] = [
  {
    title: "Día a día",
    items: [
      { href: "/", label: "Inicio", icon: IconHome, hint: "Resumen y pendientes" },
      { href: "/vender", label: "Vender", icon: IconCart, hint: "Cobrar en el mostrador" },
      { href: "/caja", label: "Caja", icon: IconCash, hint: "Apertura y cuadre" },
      { href: "/caja/cotizar", label: "Cotizar", icon: IconScale, hint: "Precio por kilo o bulto" },
      { href: "/compras", label: "Compras", icon: IconReceipt, hint: "Facturas de proveedores" },
      { href: "/empaque", label: "Empaque", icon: IconBag, hint: "Granel a bolsas" },
      { href: "/sachets", label: "Guía de sachets", icon: IconBag, hint: "Gramos de cada sachet" },
      { href: "/inventario", label: "Inventario", icon: IconBox, hint: "Existencias y conteos" },
    ],
  },
  {
    title: "Negocio",
    items: [
      { href: "/catalogo", label: "Catálogo", icon: IconLayers, hint: "Productos, presentaciones y recetas" },
      { href: "/precios", label: "Precios", icon: IconTag, hint: "Competencia y márgenes" },
      { href: "/productos", label: "Productos", icon: IconLeaf, hint: "Qué vende y cuánto deja" },
      { href: "/resultados", label: "Resultados", icon: IconChart, hint: "Utilidad mes a mes" },
    ],
  },
  {
    title: "Configuración",
    items: [
      { href: "/importar", label: "Importar", icon: IconUpload, hint: "Datos de Vendty" },
      { href: "/ajustes", label: "Ajustes", icon: IconSettings, hint: "Parámetros y usuarios" },
    ],
  },
];

const CASHIER: Group[] = [
  {
    title: "Mi trabajo",
    items: [
      { href: "/vender", label: "Vender", icon: IconCart },
      { href: "/caja", label: "Caja", icon: IconCash },
      { href: "/caja/cotizar", label: "Cotizar", icon: IconScale },
      { href: "/sachets", label: "Guía de sachets", icon: IconBag },
      { href: "/ajustes", label: "Mi clave", icon: IconKey },
    ],
  },
];

const BOTTOM_ADMIN = ["/", "/vender", "/caja", "/compras"];

/** Ícono del menú que se vuelve un indicador girando apenas se toca, mientras llega la pantalla. */
function NavIcon({ icon: Icon, className }: { icon: Item["icon"]; className: string }) {
  const { pending } = useLinkStatus();
  if (pending) {
    return <span className={`${className} inline-block animate-spin rounded-full border-2 border-current border-t-transparent`} aria-hidden />;
  }
  return <Icon className={className} />;
}

function isActive(path: string, href: string) {
  if (href === "/caja") return path === "/caja";
  return href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
}

export function AppShell({
  name, role, logout, children,
}: {
  name: string;
  role: string;
  logout: () => Promise<void>;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => setMoreOpen(false), [path]);
  const groups = role === "admin" ? ADMIN : CASHIER;
  const all = groups.flatMap((g) => g.items);
  const bottom = role === "admin" ? all.filter((i) => BOTTOM_ADMIN.includes(i.href)) : all;
  const current = all.find((i) => isActive(path, i.href));

  const Brand = (
    <Link href={role === "admin" ? "/" : "/vender"} className="flex items-end gap-2" aria-label="Vitalic Hub, inicio">
      <BrandLogo className="h-8 w-auto" />
      <span className="mb-0.5 rounded-md bg-leaf-500 px-1.5 py-0.5 font-[family-name:var(--font-brand)] text-[11px] font-bold leading-none text-leaf-800">HUB</span>
    </Link>
  );

  const UserBox = (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--surface-2)] p-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-plum-500 text-sm font-semibold text-white">
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{name}</span>
          <span className="block text-xs text-muted">{role === "admin" ? "Administrador" : "Cajera"}</span>
        </span>
      </div>
      <form action={logout}>
        <button className="rounded-lg p-2 text-muted hover:bg-[var(--surface)] hover:text-[var(--text)]" title="Salir" aria-label="Salir">
          <IconLogout className="size-5" />
        </button>
      </form>
    </div>
  );

  const NavList = (
    <nav className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <p className="mb-1.5 px-3 font-[family-name:var(--font-brand)] text-[11px] font-bold uppercase tracking-wider text-muted">{g.title}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isActive(path, item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] transition-colors ${
                      active ? "bg-brand-600 font-medium text-white shadow-sm" : "text-[var(--text)] hover:bg-[var(--surface-2)]"
                    }`}
                  >
                    <NavIcon icon={Icon} className={`size-5 ${active ? "" : "text-muted"}`} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      {/* Escritorio: barra lateral */}
      <aside className="sticky top-0 hidden h-dvh flex-col justify-between border-r border-[var(--border)] bg-[var(--surface)] p-4 lg:flex">
        <div className="space-y-6">
          <div className="px-1">{Brand}</div>
          {NavList}
        </div>
        {UserBox}
      </aside>

      {/* Celular: barra superior */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 py-2.5 backdrop-blur lg:hidden">
        {Brand}
        <span className="text-sm text-muted">{current?.label}</span>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-6xl px-4 pb-28 pt-5 lg:px-8 lg:pb-12 lg:pt-8">{children}</main>

      {/* Celular: pestañas inferiores */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <ul className="mx-auto flex max-w-md">
          {bottom.map((item) => {
            const active = isActive(path, item.href);
            const Icon = item.icon;
            return (
              <li key={item.href} className="flex-1">
                <Link href={item.href} prefetch={false} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-semibold text-brand-600 dark:text-brand-500" : "text-muted"}`}>
                  <NavIcon icon={Icon} className="size-6" />
                  {item.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button onClick={() => setMoreOpen(true)} className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] text-muted">
              <IconMenu className="size-6" />
              Más
            </button>
          </li>
        </ul>
      </nav>

      {/* Celular: menú completo */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" aria-label="Cerrar" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] space-y-5 overflow-y-auto rounded-t-3xl bg-[var(--surface)] p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="flex items-center justify-between">
              {Brand}
              <button onClick={() => setMoreOpen(false)} className="rounded-lg p-2 text-muted" aria-label="Cerrar"><IconX /></button>
            </div>
            {NavList}
            {UserBox}
          </div>
        </div>
      )}
    </div>
  );
}
