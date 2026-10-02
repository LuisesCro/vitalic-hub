"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Tablero" },
  { href: "/caja", label: "Caja" },
  { href: "/compras", label: "Compras" },
  { href: "/inventario", label: "Inventario" },
  { href: "/empaque", label: "Empaque" },
  { href: "/precios", label: "Precios" },
  { href: "/productos", label: "Productos" },
  { href: "/resultados", label: "Resultados" },
  { href: "/importar", label: "Importar" },
  { href: "/ajustes", label: "Ajustes" },
];

const CASHIER_LINKS = [
  { href: "/caja", label: "Caja" },
  { href: "/ajustes", label: "Mi clave" },
];

export function Nav({ role }: { role: string }) {
  const path = usePathname();
  const links = role === "admin" ? LINKS : CASHIER_LINKS;
  return (
    <nav className="flex gap-1 overflow-x-auto pb-1 text-sm">
      {links.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 ${
              active ? "bg-brand-600 text-white" : "hover:bg-brand-50 dark:hover:bg-white/5"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
