import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Revisión optimista: sin cookie de sesión, al login. La verificación real
// del token ocurre en cada página y acción con requireSession().
export function proxy(request: NextRequest) {
  if (!request.cookies.has("vitalic_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!login|_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
