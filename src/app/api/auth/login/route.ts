/**
 * POST /api/auth/login
 * Body: { pin: string }  — exactamente 6 dígitos
 *
 * Devuelve 200 + cookie de sesión, o 401 con `{error}` legible para la UI.
 *
 * Para evitar enumeración de PINs (saber si "123456" existe vs un PIN cualquiera),
 * todos los caminos error responden lo mismo: "PIN incorrecto" y un delay
 * uniforme. El lockout sí lo comunicamos porque el operario necesita saber por
 * qué no puede entrar.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { comparePin, isValidPinFormat } from "@/lib/pin";
import { signSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

const GENERIC_ERROR = { error: "PIN incorrecto" };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { pin?: unknown } | null;
  const pin = typeof body?.pin === "string" ? body.pin : "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = req.headers.get("user-agent") || null;

  if (!isValidPinFormat(pin)) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  // Buscamos todos los usuarios activos y testeamos el PIN contra cada hash.
  // Es O(n) pero `n` es el plantel de la fábrica (decenas, no miles), y bcrypt
  // a cost 12 (~250ms) bottleneckea antes que la query. Si en el futuro hace
  // falta escalar, agregamos un índice o pedimos `userId` en el flujo.
  const users = await prisma.user.findMany({
    where: { isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      role: true,
      pinHash: true,
      failedAttempts: true,
      lockedUntil: true,
    },
  });

  let matched: (typeof users)[number] | null = null;
  for (const u of users) {
    if (await comparePin(pin, u.pinHash)) {
      matched = u;
      break;
    }
  }

  if (!matched) {
    await prisma.authEvent.create({
      data: { action: "login.fail", ip, userAgent, details: { reason: "no_match" } },
    });
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  // ¿Bloqueado?
  const now = new Date();
  if (matched.lockedUntil && matched.lockedUntil > now) {
    const secondsLeft = Math.ceil((matched.lockedUntil.getTime() - now.getTime()) / 1000);
    await prisma.authEvent.create({
      data: {
        userId: matched.id,
        action: "login.fail",
        ip,
        userAgent,
        details: { reason: "locked", secondsLeft },
      },
    });
    return NextResponse.json(
      { error: `Usuario bloqueado. Probá en ${Math.ceil(secondsLeft / 60)} min.` },
      { status: 423 }
    );
  }

  // Match OK — crear Session y emitir JWT.
  const token = randomBytes(32).toString("hex");
  const session = await prisma.session.create({
    data: {
      userId: matched.id,
      token,
      expiresAt: new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000),
      ip,
      userAgent,
    },
  });

  await prisma.user.update({
    where: { id: matched.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
  });

  await prisma.authEvent.create({
    data: { userId: matched.id, action: "login.ok", ip, userAgent },
  });

  const jwt = await signSessionToken({
    sub: matched.id,
    sid: session.id,
    role: matched.role,
    name: matched.name,
  });

  const res = NextResponse.json({ ok: true, name: matched.name, role: matched.role });
  res.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions());
  return res;
}

// Nota: el manejo del lockout (incrementar failedAttempts + setear lockedUntil)
// está intencionalmente NO atado al usuario individual cuando no hay match —
// sería un canal lateral para enumerar PINs válidos. Si querés contar fallos
// por IP/tótem en lugar de por usuario, eso lo sumamos en una próxima iteración
// (necesita un modelo extra tipo `FailedAttemptByIP`). Mientras tanto, el
// admin puede setear lockedUntil a mano para deshabilitar temporalmente un
// usuario sin borrarlo.
