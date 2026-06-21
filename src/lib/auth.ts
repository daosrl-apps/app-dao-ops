/**
 * Sesiones: JWT firmado con `jose` guardado en cookie httpOnly.
 *
 * Diseño:
 *  - El JWT lleva `sub` (userId) y `sid` (Session.id opaco en la DB).
 *  - Cada request lee la cookie, verifica firma + exp, y opcionalmente chequea
 *    en DB que la Session no fue revocada (logout, deactivate).
 *  - Para no pegarle a la DB en cada request del middleware, el middleware solo
 *    verifica el JWT. Las rutas API pueden hacer el chequeo full en DB.
 *
 * Diferencia con sofia: acá no usamos next-auth porque el flujo es PIN-only y
 * no necesitamos OAuth, providers, etc. — jose + cookie es más simple y más
 * fácil de auditar.
 */
import { cookies } from "next/headers";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { env } from "@/lib/env";
import { prisma } from "@/lib/db";

const SECRET = new TextEncoder().encode(env.AUTH_SECRET);
const ALG = "HS256";

export const SESSION_COOKIE = "dao_ops_session";

export interface SessionClaims extends JWTPayload {
  sub: string; // userId
  sid: string; // session id en DB
  role: "OPERARIO" | "SUPERVISOR" | "ADMIN";
  name: string;
}

export async function signSessionToken(claims: Omit<SessionClaims, "iat" | "exp">): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(`${env.SESSION_TTL_SECONDS}s`)
    .sign(SECRET);
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: [ALG] });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return payload as SessionClaims;
  } catch {
    return null;
  }
}

/**
 * Lee y verifica la sesión del Request actual (en server components / route handlers).
 * Devuelve null si no hay cookie o si el JWT está vencido/inválido.
 *
 * NOTA: no chequea contra la DB que la sesión siga viva — eso lo hace
 * `getCurrentSessionStrict` (más caro pero más estricto).
 */
export async function getCurrentSessionClaims(): Promise<SessionClaims | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Versión estricta: además de verificar el JWT, confirma contra la DB que la
 * Session sigue viva (no se hizo logout, no venció) y que el usuario sigue
 * activo. Refresca `role` y `name` desde la DB, así un cambio de rol o una baja
 * surten efecto inmediato sin esperar a que venza el JWT (que puede durar 12h).
 *
 * Esto es lo que hace que el logout / la baja / el cambio de rol "corten" de
 * verdad: el middleware solo mira el JWT (Edge no puede pegarle a Prisma), pero
 * las rutas API y los Server Components pasan por acá.
 */
export async function getCurrentSessionStrict(): Promise<SessionClaims | null> {
  const claims = await getCurrentSessionClaims();
  if (!claims) return null;

  const session = await prisma.session.findUnique({
    where: { id: claims.sid },
    select: {
      expiresAt: true,
      user: { select: { role: true, name: true, isActive: true, deletedAt: true } },
    },
  });

  if (!session) return null; // revocada (logout / baja).
  if (session.expiresAt <= new Date()) return null; // vencida en DB.
  if (!session.user.isActive || session.user.deletedAt) return null; // usuario dado de baja.

  // Refrescamos rol/nombre por si cambiaron desde que se emitió el JWT.
  return { ...claims, role: session.user.role, name: session.user.name };
}

export function sessionCookieOptions(maxAgeSeconds: number = env.SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
