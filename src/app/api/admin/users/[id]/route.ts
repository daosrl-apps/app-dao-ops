/**
 *  PATCH /api/admin/users/[id]    → editar (nombre, rol, isActive, PIN, password)
 *  DELETE /api/admin/users/[id]   → soft delete (deletedAt = now, isActive = false)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { hashPin, isValidPinFormat } from "@/lib/pin";
import { hashPassword, isValidPasswordFormat, isValidUsername } from "@/lib/password";
import { registrarAuditoria } from "@/lib/auditoria";

const RolEnum = z.enum(["OPERARIO", "SUPERVISOR", "ADMIN"]);

const PatchBody = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    role: RolEnum.optional(),
    isActive: z.boolean().optional(),
    pin: z.string().optional(),
    username: z.string().optional(),
    password: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.pin && !isValidPinFormat(v.pin)) {
      ctx.addIssue({ code: "custom", path: ["pin"], message: "PIN inválido (6 dígitos)" });
    }
    if (v.username && !isValidUsername(v.username)) {
      ctx.addIssue({ code: "custom", path: ["username"], message: "Username inválido" });
    }
    if (v.password && !isValidPasswordFormat(v.password)) {
      ctx.addIssue({
        code: "custom",
        path: ["password"],
        message: "Password debe tener al menos 8 caracteres",
      });
    }
  });

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSessionApi(["ADMIN"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => null);
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const v = parsed.data;

  const data: Record<string, unknown> = {};
  if (v.name !== undefined) data.name = v.name;
  if (v.role !== undefined) data.role = v.role;
  if (v.isActive !== undefined) data.isActive = v.isActive;
  if (v.pin) data.pinHash = await hashPin(v.pin);
  if (v.username) data.username = v.username;
  if (v.password) data.passwordHash = await hashPassword(v.password);

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, username: true, role: true, isActive: true },
    });
    await registrarAuditoria(prisma, {
      tipo: "EDITAR",
      entidad: "Usuario",
      entidadId: user.id,
      resumen: `Editó el usuario ${user.name}`,
      detalle: {
        campos: Object.keys(data).map((k) => (k === "pinHash" ? "pin" : k === "passwordHash" ? "password" : k)),
      },
      usuario: { id: auth.claims.sub, name: auth.claims.name },
    });
    return NextResponse.json({ user });
  } catch (e: unknown) {
    // P2002 = unique violation (username duplicado).
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return NextResponse.json({ error: "Ese username ya existe" }, { status: 409 });
    }
    return NextResponse.json({ error: "No se pudo actualizar" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSessionApi(["ADMIN"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  if (id === auth.claims.sub) {
    return NextResponse.json({ error: "No podés borrarte a vos mismo" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data: { isActive: false, deletedAt: new Date() },
    select: { id: true, name: true },
  });
  // También invalidamos sesiones activas.
  await prisma.session.deleteMany({ where: { userId: id } });

  await registrarAuditoria(prisma, {
    tipo: "ELIMINAR",
    entidad: "Usuario",
    entidadId: user.id,
    resumen: `Dio de baja al usuario ${user.name}`,
    usuario: { id: auth.claims.sub, name: auth.claims.name },
  });

  return NextResponse.json({ ok: true });
}
