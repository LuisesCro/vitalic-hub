import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cashierCanOpen } from "@/lib/roles";

// Revisión rápida en cada visita: sin sesión válida, al login; una cajera solo
// navega por Caja y su clave. La verificación completa (usuario activo, rol
// vigente) ocurre en cada página y acción con requireSession() / requireAdmin().
export async function proxy(request: NextRequest) {
  const token = request.cookies.get("vitalic_session")?.value;
  const toLogin = () => NextResponse.redirect(new URL("/login", request.url));
  if (!token) return toLogin();
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET ?? ""));
    if (payload.role === "cajera" && !cashierCanOpen(request.nextUrl.pathname)) {
      return NextResponse.redirect(new URL("/caja", request.url));
    }
  } catch {
    return toLogin();
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
