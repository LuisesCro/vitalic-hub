import { BrandLogo } from "@/components/icons";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · Vitalic Hub" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-brand-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        {/* Curvas verde y morada como en el empaque de Vitalic. */}
        <svg className="absolute inset-x-0 bottom-0 w-full" viewBox="0 0 600 220" preserveAspectRatio="none" aria-hidden>
          <path d="M0 120 C 150 40, 330 40, 600 110 L600 220 L0 220 Z" fill="#C2CF5C" />
          <path d="M0 165 C 180 95, 360 120, 600 160 L600 220 L0 220 Z" fill="#714E89" />
          <path d="M0 200 C 200 160, 380 175, 600 195 L600 220 L0 220 Z" fill="#1C7A8C" />
        </svg>
        <BrandLogo white className="relative h-12 w-auto self-start" />
        <div className="relative max-w-md space-y-4 pb-24">
          <p className="font-[family-name:var(--font-brand)] text-4xl font-bold leading-tight">Todo el negocio, claro y en un solo lugar.</p>
          <p className="text-lg">Caja, inventario, catálogo, precios y utilidad real de Vitalic, desde el computador o el celular.</p>
        </div>
        <p className="relative font-[family-name:var(--font-brand)] text-sm font-semibold">Distribuidora de frutos secos, especias y condimentos · @vitalic_market</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-4 text-center lg:items-start lg:text-left">
            <BrandLogo className="h-12 w-auto lg:hidden" />
            <div>
              <h1 className="font-[family-name:var(--font-brand)] text-2xl font-bold tracking-tight">Hola de nuevo</h1>
              <p className="text-sm text-muted">Entra con tu correo y tu clave</p>
            </div>
          </div>
          <div className="card p-6">
            <LoginForm />
          </div>
        </div>
      </section>
    </main>
  );
}
