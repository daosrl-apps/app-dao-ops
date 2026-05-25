/**
 * POST /api/linea/finalizar
 *
 * Marca como FINALIZADO el ítem EN_CURSO actual. Si hay pausa abierta, la
 * cierra antes. Si era el último ítem del PCP, marca el PCP como FINALIZADO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";

export async function POST() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  const item = await prisma.item.findFirst({
    where: { estado: "EN_CURSO" },
    include: { pausas: { where: { fin: null } } },
  });
  if (!item) return NextResponse.json({ error: "No hay ítem en curso" }, { status: 400 });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // Cerramos pausa abierta si hay.
    for (const p of item.pausas) {
      await tx.pausa.update({ where: { id: p.id }, data: { fin: now } });
    }
    await tx.item.update({
      where: { id: item.id },
      data: { estado: "FINALIZADO", finReal: now },
    });
    // ¿Quedan ítems pendientes en este PCP?
    const pendientes = await tx.item.count({
      where: { pcpId: item.pcpId, estado: { not: "FINALIZADO" } },
    });
    if (pendientes === 0) {
      await tx.pcp.update({ where: { id: item.pcpId }, data: { estado: "FINALIZADO" } });
    }
  });

  return NextResponse.json({ ok: true });
}
