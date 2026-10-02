import { Logo } from "@/components/icons";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · Vitalic Hub" };

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-brand-700 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-brand-500/40 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 size-96 rounded-full bg-leaf-500/30 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <Logo className="size-11 rounded-2xl ring-2 ring-white/30" />
          <span className="text-lg font-semibold">Vitalic Hub</span>
        </div>
        <div className="relative max-w-md space-y-4">
          <p className="text-4xl font-bold leading-tight tracking-tight">Todo el negocio, claro y en un solo lugar.</p>
          <p className="text-brand-100">Caja, compras, inventario, precios y utilidad real de Vitalic, desde el computador o el celular.</p>
        </div>
        <p className="relative text-sm text-brand-100">Frutos secos, especias y condimentos · Alameda, Cali</p>
      </section>
      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:items-start lg:text-left">
            <Logo className="size-14 lg:hidden" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Hola de nuevo</h1>
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
