import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Revisión mínima y sin dependencias (Netlify la ejecuta en su red de borde, donde
// librerías como la de firmas pueden quedarse colgadas): sin cookie de sesión, al login.
// La verificación real (firma, usuario activo, rol de cajera) ocurre en el servidor
// en cada página y acción con requireSession() / requireAdmin().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("vitalic_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|api/salud|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
