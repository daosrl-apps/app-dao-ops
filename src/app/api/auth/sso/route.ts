import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { signSessionToken, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { getClientIp } from "@/lib/net";
import { Role } from "@prisma/client";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { username?: unknown } | null;
    const rawUsername = typeof body?.username === "string" ? body.username.trim() : "";
    if (!rawUsername) {
      return NextResponse.json({ error: "Username requerido" }, { status: 400 });
    }

    const ip = getClientIp(req.headers);
    const userAgent = req.headers.get("user-agent") || null;

    // 1. Buscar en PostgreSQL
    let user = await prisma.user.findFirst({
      where: {
        username: { equals: rawUsername, mode: "insensitive" },
        isActive: true,
        deletedAt: null,
      },
    });

    // 2. Si no existe en PostgreSQL, consultar a DAO PLANTA (Flask) para auto-aprovisionar
    if (!user) {
      try {
        const flaskUrl = process.env.DAO_PLANTA_INTERNAL_URL || "http://172.20.0.1:8087";
        const flaskRes = await fetch(`${flaskUrl}/api/users`, { cache: "no-store" });
        if (flaskRes.ok) {
          const plantUsers = (await flaskRes.json()) as Array<{
            username: string;
            role: string;
            permissions?: { produccion?: boolean };
          }>;
          const found = plantUsers.find(
            (u) => u.username.toLowerCase() === rawUsername.toLowerCase(),
          );
          if (found) {
            // Verificar si tiene permiso de producción
            if (found.permissions && found.permissions.produccion === false) {
              return NextResponse.json(
                { error: "El usuario no tiene permiso de acceso al módulo Producción" },
                { status: 403 },
              );
            }
            const role = found.role.toLowerCase() === "admin" ? Role.ADMIN : Role.SUPERVISOR;
            user = await prisma.user.create({
              data: {
                name: found.username.charAt(0).toUpperCase() + found.username.slice(1),
                username: found.username.toLowerCase(),
                role,
                isActive: true,
              },
            });
          }
        }
      } catch (err) {
        console.warn("No se pudo conectar a DAO PLANTA para auto-aprovisionamiento:", err);
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // 3. Crear Session y emitir cookie dao_ops_session
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

    const now = new Date();
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLoginAt: now },
    });

    await registrarAuditoria(prisma, {
      tipo: "LOGIN",
      entidad: "Auth",
      entidadId: user.id,
      resumen: `${user.name} inició sesión SSO desde DAO PLANTA`,
      usuario: { id: user.id, name: user.name },
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
  } catch (error: any) {
    console.error("Error en SSO:", error);
    return NextResponse.json({ error: "Error interno en SSO" }, { status: 500 });
  }
}
