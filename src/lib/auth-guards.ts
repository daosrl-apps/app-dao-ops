/**
 * Helpers para proteger Route Handlers y Server Components por rol.
 * Las páginas hacen `requireRole(["ADMIN"])` en el server y, si no, redirigen.
 * Las API hacen `requireRoleApi(req, ["ADMIN"])` y, si no, devuelven 401/403.
 */
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentSessionStrict, type SessionClaims } from "@/lib/auth";

export type Rol = SessionClaims["role"];

/**
 * Verifica la sesión y, opcionalmente, el rol del usuario. Si falla, redirige
 * a /login. Usar desde Server Components y Server Actions.
 *
 * Usa el chequeo estricto (contra DB) para que logout / baja / cambio de rol
 * surtan efecto inmediato, no recién cuando vence el JWT.
 */
export async function requireSession(roles?: readonly Rol[]): Promise<SessionClaims> {
  const claims = await getCurrentSessionStrict();
  if (!claims) redirect("/login");
  if (roles && !roles.includes(claims.role)) {
    redirect("/dashboard");
  }
  return claims;
}

/**
 * Para Route Handlers: si no hay sesión devuelve 401, si no tiene el rol
 * devuelve 403. Si todo OK devuelve los claims. Chequeo estricto contra DB.
 */
export async function requireSessionApi(
  roles?: readonly Rol[],
): Promise<{ claims: SessionClaims } | { response: NextResponse }> {
  const claims = await getCurrentSessionStrict();
  if (!claims) {
    return { response: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  if (roles && !roles.includes(claims.role)) {
    return { response: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }) };
  }
  return { claims };
}
