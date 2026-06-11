/**
 * POST /api/ordenes/[id]/split
 *
 * Divide una OT (PENDIENTE o EN_CURSO) en 2 con las MISMAS características: la
 * OT actual conserva una parte de las piezas pendientes y se crea una OT nueva
 * con el resto, al FINAL de la cola. Solo SUPERVISOR / ADMIN.
 *
 * Body:
 *   {
 *     piezasHechas?: number,  // ya pintadas/lavadas (solo tiene sentido EN_CURSO). 0 si PENDIENTE.
 *     quedaEnEsta: number,    // piezas pendientes que se quedan en esta OT (>= 1)
 *     nuevaOt: number,        // piezas pendientes que van a la OT nueva (>= 1)
 *   }
 * con `quedaEnEsta + nuevaOt === cantidad - piezasHechas`.
 *
 * Efecto:
 *  - La OT actual pasa a tener cantidad = piezasHechas + quedaEnEsta; su fin
 *    teórico se recalcula y la cola PENDIENTE posterior se recompacta por el
 *    delta de duración.
 *  - La OT nueva (cantidad = nuevaOt) se agenda al final, después de la última
 *    OT activa + gap (15 min base, +30 si cambia el color en PINTURA→PINTURA),
 *    apuntando a la actual como `ordenPadre`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { tiempoCambioSeg, ceilAMinuto } from "@/lib/schedule";
import { duracionOrdenSeg, desplazarPosteriores } from "@/lib/ordenes-edit";

const Body = z.object({
  piezasHechas: z.number().int().min(0).optional(),
  quedaEnEsta: z.number().int().positive(),
  nuevaOt: z.number().int().positive(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { quedaEnEsta, nuevaOt } = parsed.data;

  const orden = await prisma.ordenTrabajo.findUnique({
    where: { id },
    include: { articulo: { select: { piezasPorHora: true } } },
  });
  if (!orden) return NextResponse.json({ error: "OT no encontrada" }, { status: 404 });
  if (orden.estado !== "PENDIENTE" && orden.estado !== "EN_CURSO") {
    return NextResponse.json(
      { error: "Solo se puede dividir una OT pendiente o en curso." },
      { status: 400 },
    );
  }

  // `piezasHechas` solo aplica a una OT en curso; en una pendiente no hay nada
  // pintado todavía.
  const piezasHechas = orden.estado === "EN_CURSO" ? (parsed.data.piezasHechas ?? 0) : 0;
  if (piezasHechas >= orden.cantidad) {
    return NextResponse.json(
      { error: "Las piezas ya hechas no pueden ser mayores o iguales a la cantidad de la OT." },
      { status: 400 },
    );
  }
  const pendiente = orden.cantidad - piezasHechas;
  if (quedaEnEsta + nuevaOt !== pendiente) {
    return NextResponse.json(
      {
        error: `Las cantidades deben sumar las ${pendiente} piezas pendientes (recibí ${quedaEnEsta} + ${nuevaOt}).`,
        pendiente,
      },
      { status: 400 },
    );
  }

  const computar = (cantidad: number) =>
    duracionOrdenSeg({
      tipo: orden.tipo,
      cantidad,
      piezasPorHora: orden.articulo.piezasPorHora,
      color: orden.color,
      configPerchas: orden.configPerchas,
      piezasPorPercha: orden.piezasPorPercha,
      velocidadLavado: orden.velocidadLavado,
    });

  const nuevaCantidadActual = piezasHechas + quedaEnEsta;
  const finActualPrevioMs = orden.finTeorico.getTime();
  const nuevoFinActual = new Date(orden.inicioTeorico.getTime() + computar(nuevaCantidadActual) * 1000);
  const deltaMs = nuevoFinActual.getTime() - finActualPrevioMs;

  const continuacion = await prisma.$transaction(async (tx) => {
    // 1) La OT actual queda con menos piezas → recalcular su fin teórico.
    await tx.ordenTrabajo.update({
      where: { id: orden.id },
      data: { cantidad: nuevaCantidadActual, finTeorico: nuevoFinActual },
    });

    // 2) Recompactar la cola posterior por el tiempo liberado.
    await desplazarPosteriores(tx, orden.inicioProgramado, deltaMs);

    // 3) La OT nueva se agenda al FINAL: después de la última activa + gap.
    const ultima = await tx.ordenTrabajo.findFirst({
      where: { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
      orderBy: { finTeorico: "desc" },
      select: { finTeorico: true, tipo: true, color: true },
    });
    const baseFinMs = ultima ? ultima.finTeorico.getTime() : nuevoFinActual.getTime();
    const prevGap = ultima
      ? { tipo: ultima.tipo, color: ultima.color }
      : { tipo: orden.tipo, color: orden.color };
    const gapSeg = tiempoCambioSeg(prevGap, { tipo: orden.tipo, color: orden.color });
    const inicioCont = ceilAMinuto(new Date(baseFinMs + gapSeg * 1000));
    const finCont = new Date(inicioCont.getTime() + computar(nuevaOt) * 1000);

    const nueva = await tx.ordenTrabajo.create({
      data: {
        articuloId: orden.articuloId,
        tipo: orden.tipo,
        color: orden.color,
        cantidad: nuevaOt,
        piezasPorPercha: orden.piezasPorPercha,
        velocidadLavado: orden.velocidadLavado,
        configPerchas: orden.configPerchas,
        inicioProgramado: inicioCont,
        inicioTeorico: inicioCont,
        finTeorico: finCont,
        creadoPorId: auth.claims.sub,
        ordenPadreId: orden.id,
      },
      select: { id: true, numero: true },
    });

    await registrarAuditoria(tx, {
      tipo: "SPLIT",
      entidad: "OT",
      entidadId: orden.id,
      resumen: `Dividió la OT #${orden.numero}: queda con ${nuevaCantidadActual} pzs + nueva #${nueva.numero} (${nuevaOt} pzs) al final`,
      detalle: {
        ordenNumero: orden.numero,
        piezasHechas,
        quedaEnEsta,
        nuevaOt,
        cantidadOriginal: orden.cantidad,
        nuevaNumero: nueva.numero,
      },
      usuario: { id: auth.claims.sub, name: auth.claims.name },
    });

    return nueva;
  });

  return NextResponse.json({ ok: true, continuacion }, { status: 201 });
}
