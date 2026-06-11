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
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { duracionOrdenSeg, desplazarPosteriores } from "@/lib/ordenes-edit";

/**
 * PATCH /api/ordenes/[id]
 *
 * Corrige la cantidad total de una OT (PENDIENTE o EN_CURSO). SUPERVISOR/ADMIN.
 *
 * Body:
 *   {
 *     piezasHechas?: number,  // ya pintadas/lavadas (solo EN_CURSO). 0 si PENDIENTE.
 *     cantidad: number,       // nueva cantidad TOTAL de la OT (>= 1)
 *   }
 *
 * Reglas:
 *  - Si la OT está EN_CURSO, la nueva cantidad no puede ser menor que las
 *    piezas ya hechas (no se puede "despintar").
 *  - Recalcula el fin teórico y recompacta la cola PENDIENTE posterior por el
 *    delta de duración (igual que el borrado / la división).
 */
const PatchBody = z.object({
  piezasHechas: z.number().int().min(0).optional(),
  cantidad: z.number().int().positive(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { cantidad: nuevaCantidad } = parsed.data;

  const orden = await prisma.ordenTrabajo.findUnique({
    where: { id },
    include: { articulo: { select: { piezasPorHora: true } } },
  });
  if (!orden) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
  if (orden.estado !== "PENDIENTE" && orden.estado !== "EN_CURSO") {
    return NextResponse.json(
      { error: "Solo se puede corregir una OT pendiente o en curso." },
      { status: 400 },
    );
  }

  const piezasHechas = orden.estado === "EN_CURSO" ? (parsed.data.piezasHechas ?? 0) : 0;
  if (nuevaCantidad < piezasHechas) {
    return NextResponse.json(
      { error: `La cantidad no puede ser menor a las ${piezasHechas} piezas ya hechas.` },
      { status: 400 },
    );
  }
  if (nuevaCantidad === orden.cantidad) {
    return NextResponse.json({ ok: true, sinCambios: true });
  }

  const nuevaDurSeg = duracionOrdenSeg({
    tipo: orden.tipo,
    cantidad: nuevaCantidad,
    piezasPorHora: orden.articulo.piezasPorHora,
    color: orden.color,
    configPerchas: orden.configPerchas,
    piezasPorPercha: orden.piezasPorPercha,
    velocidadLavado: orden.velocidadLavado,
  });
  const nuevoFin = new Date(orden.inicioTeorico.getTime() + nuevaDurSeg * 1000);
  const deltaMs = nuevoFin.getTime() - orden.finTeorico.getTime();

  await prisma.$transaction(async (tx) => {
    await tx.ordenTrabajo.update({
      where: { id: orden.id },
      data: { cantidad: nuevaCantidad, finTeorico: nuevoFin },
    });
    await desplazarPosteriores(tx, orden.inicioProgramado, deltaMs);
    await registrarAuditoria(tx, {
      tipo: "EDITAR",
      entidad: "OT",
      entidadId: orden.id,
      resumen: `Corrigió la cantidad de la OT #${orden.numero}: ${orden.cantidad} → ${nuevaCantidad} pzs`,
      detalle: {
        ordenNumero: orden.numero,
        cantidadAnterior: orden.cantidad,
        cantidadNueva: nuevaCantidad,
        piezasHechas,
      },
      usuario: { id: auth.claims.sub, name: auth.claims.name },
    });
  });

  return NextResponse.json({ ok: true });
}

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
      numero: true,
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

  await registrarAuditoria(prisma, {
    tipo: "ELIMINAR",
    entidad: "OT",
    entidadId: id,
    resumen: `Borró la OT #${orden.numero}`,
    detalle: { ordenNumero: orden.numero },
    usuario: { id: auth.claims.sub, name: auth.claims.name },
  });

  return NextResponse.json({ ok: true });
}
