/**
 * Edge middleware: protege `/dashboard/**` validando el JWT de la cookie.
 * No pega a Prisma (Edge runtime no soporta bcrypt + pg driver) — solo
 * verifica firma + expiración con jose, que sí corre en Edge.
 *
 * Si querés revocar una sesión específica al toque (logout server-side, baja
 * de usuario), el chequeo contra la tabla Session se hace en las rutas API,
 * no acá.
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "dao_ops_session";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
const PROTECTED_PREFIXES = ["/dashboard"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    await jwtVerify(token, SECRET, { algorithms: ["HS256"] });
    return NextResponse.next();
  } catch {
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(SESSION_COOKIE);
    return res;
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
