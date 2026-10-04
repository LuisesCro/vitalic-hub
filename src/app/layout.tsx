import type { Metadata, Viewport } from "next";
// Quicksand: redondeada como la tipografía de la marca. Viene dentro de la app (sin depender de Google).
import "@fontsource/quicksand/latin-500.css";
import "@fontsource/quicksand/latin-600.css";
import "@fontsource/quicksand/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vitalic Hub",
  description: "Caja, inventario, catálogo, precios y resultados de Vitalic",
  appleWebApp: { capable: true, title: "Vitalic", statusBarStyle: "default" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2BA1B8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="antialiased">{children}</body>
    </html>
  );
}
