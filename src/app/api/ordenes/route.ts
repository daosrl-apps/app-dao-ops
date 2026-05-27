/**
 * GET    /api/ordenes  → lista de OTs (más recientes primero)
 * POST   /api/ordenes  → crear nueva OT (1 OT = 1 ítem LAVADO o PINTURA)
 * DELETE /api/ordenes  → borra TODAS las OTs (solo ADMIN; feature temporal)
 *
 * POST body:
 *   {
 *     articuloId: string,
 *     tipo: "LAVADO" | "PINTURA",
 *     color: string,
 *     cantidad: number,
 *     inicioProgramado: ISOString,
 *     piezasPorPercha?: number,   // solo LAVADO
 *     velocidadLavado?: number,   // solo LAVADO
 *     // Si la OT excede el turno, el cliente puede solicitar split:
 *     split?: {
 *       cantidadHoy: number,      // piezas que se completan en este turno
 *       // El resto se crea como una segunda OT (continuación) en el próximo turno.
 *     }
 *   }
 *
 * Respuesta cuando la OT excede el turno y el cliente NO mandó `split`:
 *   { needsSplit: true, fitSeg, restoSeg, finTurno, proximoInicio, sugerenciaCantidadHoy }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { duracionItem, type ItemCalculable } from "@/lib/schedule";
import { obtenerTurnos, evaluarOrdenContraTurno } from "@/lib/turnos";

const Body = z.object({
  articuloId: z.string().min(1),
  tipo: z.enum(["LAVADO", "PINTURA"]),
  color: z.string().min(1),
  cantidad: z.number().int().positive(),
  inicioProgramado: z.string().datetime(),
  piezasPorPercha: z.number().int().min(1).max(10).nullable().optional(),
  velocidadLavado: z.number().min(0.1).max(3.0).nullable().optional(),
  split: z
    .object({
      cantidadHoy: z.number().int().positive(),
    })
    .nullable()
    .optional(),
});

export async function GET() {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN", "OPERARIO"]);
  if ("response" in auth) return auth.response;

  const ordenes = await prisma.ordenTrabajo.findMany({
    take: 200,
    orderBy: { inicioProgramado: "desc" },
    include: {
      articulo: { include: { cliente: true } },
      creadoPor: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ ordenes });
}

export async function DELETE() {
  const auth = await requireSessionApi(["ADMIN"]);
  if ("response" in auth) return auth.response;

  const result = await prisma.ordenTrabajo.deleteMany({});
  return NextResponse.json({ ok: true, borradas: result.count });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const articulo = await prisma.articulo.findUnique({
    where: { id: data.articuloId },
    select: { id: true, piezasPorHora: true, configPerchas: true },
  });
  if (!articulo) {
    return NextResponse.json({ error: "Artículo no encontrado" }, { status: 400 });
  }
  if (data.tipo === "LAVADO" && (data.piezasPorPercha == null || data.velocidadLavado == null)) {
    return NextResponse.json(
      { error: "OT de lavado requiere piezasPorPercha y velocidadLavado" },
      { status: 400 },
    );
  }

  const inicio = new Date(data.inicioProgramado);

  const computar = (cantidad: number) => {
    const ic: ItemCalculable = {
      tipo: data.tipo,
      cantidadPiezas: cantidad,
      piezasPorHora: articulo.piezasPorHora,
      color: data.color,
      configPerchas: articulo.configPerchas ?? null,
      piezasPorPercha: data.tipo === "LAVADO" ? (data.piezasPorPercha ?? null) : null,
      velocidadLavado: data.tipo === "LAVADO" ? (data.velocidadLavado ?? null) : null,
    };
    return duracionItem(ic).totalSeg;
  };

  const turnos = await obtenerTurnos();
  const duracionSegOriginal = computar(data.cantidad);
  const evaluacion = evaluarOrdenContraTurno(turnos, inicio, duracionSegOriginal);

  if (!evaluacion.entra && !data.split) {
    // Sugerencia: cuánto entra del total. Para PINTURA es fracción de cantidad
    // proporcional al fit; para LAVADO la fórmula no es lineal pero
    // aproximamos por la misma fracción (mejor que nada para el modal).
    const fraccion = duracionSegOriginal > 0 ? evaluacion.fitSeg / duracionSegOriginal : 0;
    const sugerencia = Math.max(0, Math.min(data.cantidad - 1, Math.floor(data.cantidad * fraccion)));
    return NextResponse.json(
      {
        needsSplit: true,
        fitSeg: evaluacion.fitSeg,
        restoSeg: evaluacion.restoSeg,
        finTurno: evaluacion.finTurno.toISOString(),
        proximoInicio: evaluacion.proximoInicio.toISOString(),
        sugerenciaCantidadHoy: sugerencia,
      },
      { status: 200 },
    );
  }

  // Hay split → crear dos OTs: una hoy con cantidadHoy, otra mañana con el resto.
  if (data.split) {
    const cantidadHoy = data.split.cantidadHoy;
    const cantidadResto = data.cantidad - cantidadHoy;
    if (cantidadHoy <= 0 || cantidadResto <= 0 || cantidadHoy >= data.cantidad) {
      return NextResponse.json(
        { error: "cantidadHoy debe estar entre 1 y cantidad-1" },
        { status: 400 },
      );
    }

    const durHoy = computar(cantidadHoy);
    const durResto = computar(cantidadResto);

    // Si no había evaluación previa (caso raro: el cliente mandó split sin ser
    // necesario), aún así respetamos las cantidades.
    const proximoInicio =
      evaluacion.entra === false ? evaluacion.proximoInicio : new Date(inicio.getTime() + durHoy * 1000);

    const padre = await prisma.ordenTrabajo.create({
      data: {
        articuloId: data.articuloId,
        tipo: data.tipo,
        color: data.color,
        cantidad: cantidadHoy,
        piezasPorPercha: data.tipo === "LAVADO" ? (data.piezasPorPercha ?? null) : null,
        velocidadLavado: data.tipo === "LAVADO" ? (data.velocidadLavado ?? null) : null,
        configPerchas: articulo.configPerchas ?? null,
        inicioProgramado: inicio,
        inicioTeorico: inicio,
        finTeorico: new Date(inicio.getTime() + durHoy * 1000),
        creadoPorId: auth.claims.sub,
      },
      include: { articulo: { include: { cliente: true } } },
    });

    const continuacion = await prisma.ordenTrabajo.create({
      data: {
        articuloId: data.articuloId,
        tipo: data.tipo,
        color: data.color,
        cantidad: cantidadResto,
        piezasPorPercha: data.tipo === "LAVADO" ? (data.piezasPorPercha ?? null) : null,
        velocidadLavado: data.tipo === "LAVADO" ? (data.velocidadLavado ?? null) : null,
        configPerchas: articulo.configPerchas ?? null,
        inicioProgramado: proximoInicio,
        inicioTeorico: proximoInicio,
        finTeorico: new Date(proximoInicio.getTime() + durResto * 1000),
        creadoPorId: auth.claims.sub,
        ordenPadreId: padre.id,
      },
      include: { articulo: { include: { cliente: true } } },
    });

    return NextResponse.json({ ok: true, orden: padre, continuacion }, { status: 201 });
  }

  // La OT entra completa en el turno → caso simple.
  const orden = await prisma.ordenTrabajo.create({
    data: {
      articuloId: data.articuloId,
      tipo: data.tipo,
      color: data.color,
      cantidad: data.cantidad,
      piezasPorPercha: data.tipo === "LAVADO" ? (data.piezasPorPercha ?? null) : null,
      velocidadLavado: data.tipo === "LAVADO" ? (data.velocidadLavado ?? null) : null,
      configPerchas: articulo.configPerchas ?? null,
      inicioProgramado: inicio,
      inicioTeorico: inicio,
      finTeorico: new Date(inicio.getTime() + duracionSegOriginal * 1000),
      creadoPorId: auth.claims.sub,
    },
    include: { articulo: { include: { cliente: true } } },
  });

  return NextResponse.json({ ok: true, orden }, { status: 201 });
}
