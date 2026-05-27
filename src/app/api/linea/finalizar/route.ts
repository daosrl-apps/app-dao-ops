/**
 * POST /api/linea/finalizar
 *
 * Marca como FINALIZADA la OT EN_CURSO. Si hay pausa abierta, la cierra antes.
 * Setea `cantidadCompletada = cantidad` (se completó al 100%).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";

export async function POST() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  const orden = await prisma.ordenTrabajo.findFirst({
    where: { estado: "EN_CURSO" },
    include: { pausas: { where: { fin: null } } },
  });
  if (!orden) return NextResponse.json({ error: "No hay OT en curso" }, { status: 400 });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const p of orden.pausas) {
      await tx.pausa.update({ where: { id: p.id }, data: { fin: now } });
    }
    await tx.ordenTrabajo.update({
      where: { id: orden.id },
      data: {
        estado: "FINALIZADO",
        finReal: now,
        cantidadCompletada: orden.cantidad,
      },
    });
  });

  return NextResponse.json({ ok: true });
}
