/**
 * Gestión de usuarios (solo ADMIN).
 *  GET   /api/admin/users           → lista
 *  POST  /api/admin/users           → alta
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { hashPin, isValidPinFormat } from "@/lib/pin";
import { hashPassword, isValidPasswordFormat, isValidUsername } from "@/lib/password";

const RolEnum = z.enum(["OPERARIO", "SUPERVISOR", "ADMIN"]);

const CreateBody = z
  .object({
    name: z.string().trim().min(2).max(80),
    role: RolEnum,
    pin: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "OPERARIO") {
      if (!v.pin || !isValidPinFormat(v.pin)) {
        ctx.addIssue({ code: "custom", path: ["pin"], message: "PIN inválido (6 dígitos)" });
      }
    } else {
      if (!v.username || !isValidUsername(v.username)) {
        ctx.addIssue({ code: "custom", path: ["username"], message: "Username inválido" });
      }
      if (!v.password || !isValidPasswordFormat(v.password)) {
        ctx.addIssue({
          code: "custom",
          path: ["password"],
          message: "Password debe tener al menos 8 caracteres",
        });
      }
    }
  });

export async function GET() {
  const auth = await requireSessionApi(["ADMIN"]);
  if ("response" in auth) return auth.response;

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      username: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionApi(["ADMIN"]);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => null);
  const parsed = CreateBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { name, role, pin, username, password } = parsed.data;

  if (username) {
    const dup = await prisma.user.findUnique({ where: { username } });
    if (dup) {
      return NextResponse.json({ error: "Ese usuario ya existe" }, { status: 409 });
    }
  }

  const data: {
    name: string;
    role: typeof role;
    pinHash?: string;
    username?: string;
    passwordHash?: string;
  } = { name, role };

  if (role === "OPERARIO" && pin) {
    data.pinHash = await hashPin(pin);
  } else if (username && password) {
    data.username = username;
    data.passwordHash = await hashPassword(password);
  }

  const user = await prisma.user.create({
    data,
    select: { id: true, name: true, username: true, role: true, isActive: true },
  });
  return NextResponse.json({ user }, { status: 201 });
}
