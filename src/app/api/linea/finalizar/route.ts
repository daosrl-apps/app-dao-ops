/**
 * POST /api/linea/finalizar
 *
 * Marca como FINALIZADA la OT EN_CURSO. Si hay pausa abierta, la cierra antes.
 *
 * Body (todo opcional):
 *   {
 *     cantidadCompletada?: number,  // si < cantidad → split del remanente
 *     observaciones?: string,       // justificación del desvío
 *   }
 *
 * Reglas:
 *  - Se calcula el tiempo real trabajado (elapsed − pausas) y se compara contra
 *    el teórico de la cantidad efectivamente completada. Si el desvío supera el
 *    ±20% y no vino `observaciones`, se responde 409 `needsJustificacion` sin
 *    finalizar. La justificación se guarda en `OrdenTrabajo.observaciones`.
 *  - Si `cantidadCompletada < cantidad`, la OT se cierra con esa cantidad y el
 *    remanente se agenda como una OT continuación AL FINAL de la cola (fin de la
 *    última OT activa + gap 15min / +30 por cambio de color).
 *  - Tras finalizar, las OTs PENDIENTE se RE-ENCADENAN automáticamente desde el
 *    fin REAL de esta OT (gap 15 min / +45 si cambia color, respetando las
 *    ventanas de jornada). Así, si una OT se atrasa o adelanta, la cola se ajusta
 *    sola: la siguiente arranca 15/45 min después del fin real y no queda marcada
 *    como atrasada en el Gantt.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { registrarAuditoria } from "@/lib/auditoria";
import {
  duracionItem,
  tiempoCambioSeg,
  ceilAMinuto,
  requiereJustificacion,
  desvioRelativo,
  reencadenarEnJornada,
  type ItemCalculable,
  type ItemReencadenable,
} from "@/lib/schedule";
import { obtenerTurnos, turnoQueContiene, proximoTurnoDesde } from "@/lib/turnos";

const Body = z.object({
  cantidadCompletada: z.number().int().positive().optional(),
  observaciones: z.string().trim().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  const parsed = Body.safeParse((await req.json().catch(() => null)) ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const body = parsed.data;

  const orden = await prisma.ordenTrabajo.findFirst({
    where: { estado: "EN_CURSO" },
    include: { pausas: true, articulo: { select: { piezasPorHora: true, configPerchas: true } } },
  });
  if (!orden) return NextResponse.json({ error: "No hay OT en curso" }, { status: 400 });

  const cantidadFinal = body.cantidadCompletada ?? orden.cantidad;
  if (cantidadFinal > orden.cantidad) {
    return NextResponse.json(
      { error: "La cantidad completada no puede superar la cantidad de la OT" },
      { status: 400 },
    );
  }
  const esSplit = cantidadFinal < orden.cantidad;

  const now = new Date();
  const inicioRealMs = orden.inicioReal?.getTime() ?? now.getTime();

  // Tiempo de pausas: usa override si está; la pausa abierta cuenta hasta ahora.
  const pausasMs = orden.pausas.reduce((acc, p) => {
    if (p.duracionOverrideSeg != null) return acc + p.duracionOverrideSeg * 1000;
    if (p.fin) return acc + (p.fin.getTime() - p.inicio.getTime());
    return acc + (now.getTime() - p.inicio.getTime());
  }, 0);

  const realSeg = Math.max(0, Math.round((now.getTime() - inicioRealMs - pausasMs) / 1000));

  // Teórico de la cantidad efectivamente completada (para comparar la "tasa").
  const calc = (cantidad: number): number => {
    const ic: ItemCalculable = {
      tipo: orden.tipo,
      cantidadPiezas: cantidad,
      piezasPorHora: orden.articulo.piezasPorHora,
      color: orden.color,
      configPerchas: orden.configPerchas ?? null,
      piezasPorPercha: orden.tipo === "LAVADO" ? orden.piezasPorPercha : null,
      velocidadLavado: orden.tipo === "LAVADO" ? orden.velocidadLavado : null,
    };
    return duracionItem(ic).totalSeg;
  };
  const teoricoSeg = calc(cantidadFinal);

  // Justificación obligatoria si el desvío supera el umbral y no vino texto.
  if (orden.inicioReal && requiereJustificacion(realSeg, teoricoSeg) && !body.observaciones) {
    const delta = desvioRelativo(realSeg, teoricoSeg);
    return NextResponse.json(
      {
        needsJustificacion: true,
        realSeg,
        teoricoSeg,
        deltaPct: Math.round(delta * 100),
        cantidadFinal,
      },
      { status: 409 },
    );
  }

  // Turnos para el reencadenado consciente de jornada (lectura fuera de la tx).
  const turnos = await obtenerTurnos();

  const resultado = await prisma.$transaction(async (tx) => {
    // Cerrar pausas abiertas.
    for (const p of orden.pausas) {
      if (!p.fin) await tx.pausa.update({ where: { id: p.id }, data: { fin: now } });
    }

    // Si es split, el fin teórico del padre se recorta a la porción completada
    // para que el desvío mostrado sea coherente.
    const finTeoricoPadre = esSplit
      ? new Date(orden.inicioTeorico.getTime() + teoricoSeg * 1000)
      : orden.finTeorico;

    await tx.ordenTrabajo.update({
      where: { id: orden.id },
      data: {
        estado: "FINALIZADO",
        finReal: now,
        cantidadCompletada: cantidadFinal,
        finTeorico: finTeoricoPadre,
        ...(body.observaciones ? { observaciones: body.observaciones } : {}),
      },
    });

    await registrarAuditoria(tx, {
      tipo: "FINALIZAR",
      entidad: "OT",
      entidadId: orden.id,
      resumen: `Finalizó la OT #${orden.numero} (${cantidadFinal}/${orden.cantidad} pzs)`,
      detalle: {
        ordenNumero: orden.numero,
        cantidadCompletada: cantidadFinal,
        cantidad: orden.cantidad,
        realSeg,
        teoricoSeg,
        observaciones: body.observaciones ?? null,
      },
      usuario: { id: auth.claims.sub, name: auth.claims.name },
    });

    let continuacion: { id: string; numero: number } | null = null;

    if (esSplit) {
      // Continuación con el remanente, al FINAL de la cola.
      const restoCantidad = orden.cantidad - cantidadFinal;
      const durResto = calc(restoCantidad);

      const ultima = await tx.ordenTrabajo.findFirst({
        where: { estado: { in: ["PENDIENTE", "EN_CURSO"] }, id: { not: orden.id } },
        orderBy: { finTeorico: "desc" },
        select: { finTeorico: true, tipo: true, color: true },
      });
      const baseFinMs = ultima ? ultima.finTeorico.getTime() : now.getTime();
      const prevGap = ultima
        ? { tipo: ultima.tipo, color: ultima.color }
        : { tipo: orden.tipo, color: orden.color };
      const gapSeg = tiempoCambioSeg(prevGap, { tipo: orden.tipo, color: orden.color });
      const inicioCont = ceilAMinuto(new Date(baseFinMs + gapSeg * 1000));
      const finCont = new Date(inicioCont.getTime() + durResto * 1000);

      continuacion = await tx.ordenTrabajo.create({
        data: {
          articuloId: orden.articuloId,
          tipo: orden.tipo,
          color: orden.color,
          cantidad: restoCantidad,
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
        entidadId: continuacion.id,
        resumen: `Remanente de la OT #${orden.numero} → continuación #${continuacion.numero} (${restoCantidad} pzs) al final de la cola`,
        detalle: { ordenPadre: orden.numero, restoCantidad, inicioProgramado: inicioCont.toISOString() },
        usuario: { id: auth.claims.sub, name: auth.claims.name },
      });
    }

    // Re-encadenar AUTOMÁTICAMENTE las OTs PENDIENTE desde el fin real de esta
    // OT. La cola se ajusta al atraso/adelanto real: la siguiente arranca
    // 15 min (o 45 si cambia color) después del fin real, respetando las
    // ventanas de jornada (si no entra antes del cierre, salta a la próxima).
    // Incluye la continuación recién creada (queda al final por su inicio).
    const pendientes = await tx.ordenTrabajo.findMany({
      where: { estado: "PENDIENTE" },
      orderBy: { inicioProgramado: "asc" },
      select: { id: true, tipo: true, color: true, inicioTeorico: true, finTeorico: true },
    });

    if (pendientes.length > 0) {
      // Gap entre la OT recién finalizada y la primera pendiente (puede ser +45
      // si cambia color). Se baja al ancla porque reencadenarEnJornada no aplica
      // gap antes del primer ítem.
      const primeraGapSeg = tiempoCambioSeg(
        { tipo: orden.tipo, color: orden.color },
        { tipo: pendientes[0].tipo, color: pendientes[0].color },
      );
      const ancla = ceilAMinuto(new Date(now.getTime() + primeraGapSeg * 1000));

      const items: ItemReencadenable[] = pendientes.map((p) => ({
        tipo: p.tipo,
        color: p.color,
        duracionSeg: Math.round((p.finTeorico.getTime() - p.inicioTeorico.getTime()) / 1000),
      }));

      const plan = reencadenarEnJornada(items, ancla, {
        ventanaDe: (t) => turnoQueContiene(turnos, t),
        proximoInicio: (desde) => proximoTurnoDesde(turnos, desde),
      });

      for (let i = 0; i < pendientes.length; i++) {
        const { inicio, fin } = plan[i];
        await tx.ordenTrabajo.update({
          where: { id: pendientes[i].id },
          data: { inicioProgramado: inicio, inicioTeorico: inicio, finTeorico: fin },
        });
      }
    }

    return { continuacion };
  });

  return NextResponse.json({ ok: true, continuacion: resultado.continuacion });
}
