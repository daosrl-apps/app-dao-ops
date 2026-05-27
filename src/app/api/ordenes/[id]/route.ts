/**
 * DELETE /api/ordenes/[id]
 *
 * Borra una OT individual. SUPERVISOR o ADMIN. No se puede borrar una OT
 * EN_CURSO (primero finalizarla o cancelarla).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const orden = await prisma.ordenTrabajo.findUnique({ where: { id }, select: { estado: true } });
  if (!orden) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
  if (orden.estado === "EN_CURSO") {
    return NextResponse.json(
      { error: "No se puede borrar una OT en curso. Finalizala o cancelala primero." },
      { status: 400 },
    );
  }

  await prisma.ordenTrabajo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
