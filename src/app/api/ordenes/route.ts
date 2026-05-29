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
 *     }
 *   }
 *
 * Reglas:
 *   - El inicioProgramado debe ser >= "mínimo permitido" = fin de la última
 *     OT activa + gap (15 min base, +30 si cambia color). Si no, 409 OVERLAP.
 *   - Si la OT excede el turno donde cae el inicio, se devuelve `needsSplit`
 *     con una sugerencia de cuántas piezas se completan hoy. El usuario
 *     puede reenviar con `split.cantidadHoy` y el sistema crea la padre +
 *     una continuación en el primer turno del día siguiente.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import {
  duracionItem,
  GAP_BASE_SEG,
  CAMBIO_COLOR_SEG,
  type ItemCalculable,
} from "@/lib/schedule";
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

  // Borra TODAS las OTs (las pausas caen por cascade) y reinicia el contador
  // `numero` para que la próxima OT vuelva a empezar en #1.
  const borradas = await prisma.$transaction(async (tx) => {
    const r = await tx.ordenTrabajo.deleteMany({});
    await tx.$executeRawUnsafe('ALTER SEQUENCE "OrdenTrabajo_numero_seq" RESTART WITH 1');
    return r.count;
  });
  return NextResponse.json({ ok: true, borradas });
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

  // Validar que el inicio respete el mínimo (no solape con la última activa).
  const ultima = await prisma.ordenTrabajo.findFirst({
    where: { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
    orderBy: { finTeorico: "desc" },
    select: { id: true, numero: true, tipo: true, color: true, finTeorico: true },
  });
  if (ultima) {
    let gapSeg = GAP_BASE_SEG;
    if (data.tipo === "PINTURA" && ultima.tipo === "PINTURA") {
      const cambiaColor = ultima.color.trim().toLowerCase() !== data.color.trim().toLowerCase();
      if (cambiaColor) gapSeg = GAP_BASE_SEG + CAMBIO_COLOR_SEG;
    }
    const minimo = new Date(ultima.finTeorico.getTime() + gapSeg * 1000);
    if (inicio.getTime() < minimo.getTime()) {
      return NextResponse.json(
        {
          error: "El horario de inicio se solapa con otra OT.",
          minimo: minimo.toISOString(),
          gapSeg,
          ordenAnterior: { numero: ultima.numero, finTeorico: ultima.finTeorico.toISOString() },
        },
        { status: 409 },
      );
    }
  }

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

  // Hay split → crear padre (hoy) + continuación (mañana).
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

  // La OT entra completa en el turno.
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
