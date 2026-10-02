import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · Vitalic Hub" };

export default function LoginPage() {
  return (
    <main className="min-h-dvh grid place-items-center px-4">
      <div className="card w-full max-w-sm">
        <h1 className="text-2xl font-semibold text-brand-700">Vitalic Hub</h1>
        <p className="mb-6 text-sm text-muted">Frutos secos, especias y condimentos</p>
        <LoginForm />
      </div>
    </main>
  );
}
