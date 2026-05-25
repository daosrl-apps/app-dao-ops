/**
 * POST /api/auth/login-password
 * Body: { username: string, password: string }
 *
 * Login para supervisores / administradores. El operario sigue por
 * /api/auth/login (PIN).
 *
 * Respuesta uniforme ante error para no filtrar enumeración de usernames.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { comparePassword } from "@/lib/password";
import { signSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { MAX_FAILED_ATTEMPTS, LOCKOUT_DURATION_MS } from "@/lib/pin";

const GENERIC_ERROR = { error: "Usuario o contraseña incorrectos" };

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as
    | { username?: unknown; password?: unknown }
    | null;
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = req.headers.get("user-agent") || null;

  if (!username || !password) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const user = await prisma.user.findFirst({
    where: { username, isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      role: true,
      passwordHash: true,
      failedAttempts: true,
      lockedUntil: true,
    },
  });

  if (!user || !user.passwordHash) {
    // bcrypt dummy para que el tiempo de respuesta no revele si el username existe.
    await comparePassword(password, "$2a$12$abcdefghijklmnopqrstuv");
    await prisma.authEvent.create({
      data: {
        action: "login.fail",
        ip,
        userAgent,
        details: { reason: "user_not_found", username },
      },
    });
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const now = new Date();
  if (user.lockedUntil && user.lockedUntil > now) {
    const secondsLeft = Math.ceil((user.lockedUntil.getTime() - now.getTime()) / 1000);
    await prisma.authEvent.create({
      data: {
        userId: user.id,
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

  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    const nuevosFallos = user.failedAttempts + 1;
    const lockedUntil =
      nuevosFallos >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: nuevosFallos, lockedUntil },
    });
    await prisma.authEvent.create({
      data: {
        userId: user.id,
        action: lockedUntil ? "lockout" : "login.fail",
        ip,
        userAgent,
        details: { reason: "bad_password", failedAttempts: nuevosFallos },
      },
    });
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  // Match OK.
  const token = randomBytes(32).toString("hex");
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + env.SESSION_TTL_SECONDS * 1000),
      ip,
      userAgent,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
  });

  await prisma.authEvent.create({
    data: { userId: user.id, action: "login.ok", ip, userAgent },
  });

  const jwt = await signSessionToken({
    sub: user.id,
    sid: session.id,
    role: user.role,
    name: user.name,
  });

  const res = NextResponse.json({ ok: true, name: user.name, role: user.role });
  res.cookies.set(SESSION_COOKIE, jwt, sessionCookieOptions());
  return res;
}
