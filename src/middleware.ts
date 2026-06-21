/**
 * Edge middleware. Dos chequeos según la ruta:
 *
 *  - `/dashboard/**`, `/operario/**`: sesión de usuario (JWT en cookie). No
 *    pega a Prisma (Edge no soporta bcrypt + pg) — solo verifica firma + exp
 *    con jose. La revocación server-side (logout, baja, cambio de rol) se
 *    chequea en las rutas API vía `getCurrentSessionStrict`.
 *
 *  - `/tv/**`, `/api/tv/**`: token de TV (`TV_TOKEN`). El TV no tiene login;
 *    se abre una vez `/tv?token=XXX`, validamos y dejamos cookie de larga
 *    duración. Sin token válido devolvemos 403 (pág.) / 401 (API). Fail-closed:
 *    si `TV_TOKEN` no está configurado, se deniega el acceso a TV.
 */
import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { TV_COOKIE, TV_COOKIE_MAX_AGE, tokenMatches } from "@/lib/tv-auth";

const SESSION_COOKIE = "dao_ops_session";
const SECRET = new TextEncoder().encode(process.env.AUTH_SECRET ?? "");
const SESSION_PREFIXES = ["/dashboard", "/operario"];

function tvCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TV_COOKIE_MAX_AGE,
  };
}

function handleTv(req: NextRequest): NextResponse {
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  const deny = () =>
    isApi
      ? NextResponse.json({ error: "No autorizado" }, { status: 401 })
      : new NextResponse("No autorizado — falta el token de TV.", { status: 403 });

  const expected = process.env.TV_TOKEN ?? "";
  if (!expected) return deny(); // fail-closed: TV_TOKEN sin configurar.

  // 1) Token por query → validar, setear cookie y limpiar la URL (no dejar el
  //    token en la barra de direcciones / historial).
  const queryToken = req.nextUrl.searchParams.get("token");
  if (queryToken && tokenMatches(queryToken, expected)) {
    if (isApi) {
      const res = NextResponse.next();
      res.cookies.set(TV_COOKIE, expected, tvCookieOptions());
      return res;
    }
    const clean = req.nextUrl.clone();
    clean.searchParams.delete("token");
    const res = NextResponse.redirect(clean);
    res.cookies.set(TV_COOKIE, expected, tvCookieOptions());
    return res;
  }

  // 2) Cookie ya seteada.
  const cookieToken = req.cookies.get(TV_COOKIE)?.value;
  if (cookieToken && tokenMatches(cookieToken, expected)) {
    return NextResponse.next();
  }

  return deny();
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/tv") || pathname.startsWith("/api/tv")) {
    return handleTv(req);
  }

  const needsSession = SESSION_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsSession) return NextResponse.next();

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
  matcher: [
    "/dashboard/:path*",
    "/operario/:path*",
    "/tv/:path*",
    "/api/tv/:path*",
  ],
};
