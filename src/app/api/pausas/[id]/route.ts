/**
 * Gestión de una pausa individual. Solo SUPERVISOR / ADMIN.
 *
 * DELETE /api/pausas/[id]  → elimina la pausa.
 * PATCH  /api/pausas/[id]  → edita los minutos de la pausa.
 *   Body: { minutos: number }  → setea `duracionOverrideSeg = minutos*60`
 *   (override manual que preserva el `fin` real; ver schema.prisma).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { registrarAuditoria } from "@/lib/auditoria";

const Patch = z.object({ minutos: z.number().min(0).max(24 * 60) });

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const pausa = await prisma.pausa.findUnique({
    where: { id },
    include: { orden: { select: { numero: true } } },
  });
  if (!pausa) return NextResponse.json({ error: "Pausa no encontrada" }, { status: 404 });

  await prisma.pausa.delete({ where: { id } });

  await registrarAuditoria(prisma, {
    tipo: "ELIMINAR",
    entidad: "Pausa",
    entidadId: id,
    resumen: `Eliminó una pausa de la OT #${pausa.orden.numero}: ${pausa.motivo}`,
    detalle: { ordenId: pausa.ordenId, ordenNumero: pausa.orden.numero, motivo: pausa.motivo },
    usuario: { id: auth.claims.sub, name: auth.claims.name },
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Indicá los minutos (0–1440)" }, { status: 400 });
  }
  const durSeg = Math.round(parsed.data.minutos * 60);

  const pausa = await prisma.pausa.findUnique({
    where: { id },
    include: { orden: { select: { numero: true } } },
  });
  if (!pausa) return NextResponse.json({ error: "Pausa no encontrada" }, { status: 404 });

  await prisma.pausa.update({ where: { id }, data: { duracionOverrideSeg: durSeg } });

  await registrarAuditoria(prisma, {
    tipo: "EDITAR",
    entidad: "Pausa",
    entidadId: id,
    resumen: `Editó la duración de una pausa de la OT #${pausa.orden.numero} a ${parsed.data.minutos} min`,
    detalle: { ordenId: pausa.ordenId, ordenNumero: pausa.orden.numero, minutos: parsed.data.minutos },
    usuario: { id: auth.claims.sub, name: auth.claims.name },
  });

  return NextResponse.json({ ok: true });
}
