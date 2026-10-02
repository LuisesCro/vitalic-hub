import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vitalic Hub",
  description: "Inventario, compras, precios y resultados de Vitalic",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#178a9a" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="antialiased">{children}</body>
    </html>
  );
}
