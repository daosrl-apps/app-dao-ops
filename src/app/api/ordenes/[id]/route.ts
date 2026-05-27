/**
 * DELETE /api/ordenes/[id]
 *
 * Borra una OT individual. SUPERVISOR o ADMIN.
 * No se puede borrar una OT EN_CURSO (primero finalizarla o cancelarla).
 *
 * Tras borrar, recompacta las OTs PENDIENTE posteriores: cada una se mueve
 * hacia adelante (más temprano) por (duración + gap) de la que se borró, para
 * cerrar el hueco. Las que están EN_CURSO o FINALIZADA quedan donde estaban.
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

  const orden = await prisma.ordenTrabajo.findUnique({
    where: { id },
    select: {
      id: true,
      estado: true,
      inicioProgramado: true,
      inicioTeorico: true,
      finTeorico: true,
    },
  });
  if (!orden) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
  if (orden.estado === "EN_CURSO") {
    return NextResponse.json(
      { error: "No se puede borrar una OT en curso. Finalizala o cancelala primero." },
      { status: 400 },
    );
  }

  // Cantidad de tiempo que liberamos = duración total que ocupaba esta OT
  // (incluyendo el "espacio" que reservaba en la cadena, que es su duración).
  const liberadoMs = orden.finTeorico.getTime() - orden.inicioTeorico.getTime();

  await prisma.$transaction(async (tx) => {
    await tx.ordenTrabajo.delete({ where: { id } });

    if (liberadoMs <= 0) return;

    // Recompactar: todas las OTs PENDIENTE con inicio > la borrada se mueven
    // hacia atrás por `liberadoMs`. Las EN_CURSO o FINALIZADA no se tocan.
    const pendientesPosteriores = await tx.ordenTrabajo.findMany({
      where: {
        estado: "PENDIENTE",
        inicioProgramado: { gt: orden.inicioProgramado },
      },
      select: { id: true, inicioProgramado: true, inicioTeorico: true, finTeorico: true },
    });

    for (const p of pendientesPosteriores) {
      await tx.ordenTrabajo.update({
        where: { id: p.id },
        data: {
          inicioProgramado: new Date(p.inicioProgramado.getTime() - liberadoMs),
          inicioTeorico: new Date(p.inicioTeorico.getTime() - liberadoMs),
          finTeorico: new Date(p.finTeorico.getTime() - liberadoMs),
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
