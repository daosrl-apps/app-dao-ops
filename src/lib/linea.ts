/**
 * Snapshot de la línea de producción.
 *
 * "Actual" = la OT que el operario está trabajando ahora (EN_CURSO).
 * Si no hay nada EN_CURSO, devolvemos la próxima OT PENDIENTE ordenada por
 * `inicioProgramado`.
 *
 * "Anterior" = la OT más reciente FINALIZADA. "Siguientes" = las siguientes
 * PENDIENTE en cola por `inicioProgramado`.
 */
import { prisma } from "@/lib/db";

export interface LineaOrden {
  id: string;
  numero: number;
  estado: string;
  tipo: "LAVADO" | "PINTURA";
  color: string;
  cantidad: number;
  piezasPorPercha: number | null;
  velocidadLavado: number | null;
  inicioProgramado: string;
  inicioTeorico: string;
  finTeorico: string;
  /// Duración teórica en segundos (precalculada para el cliente).
  duracionTeoricaSeg: number;
  inicioReal: string | null;
  finReal: string | null;
  articulo: { codigo: string; descripcion: string | null };
  cliente: { nombre: string };
  /// Pausa actualmente abierta (sin `fin`), si hay.
  pausaActiva: { id: string; inicio: string } | null;
  /// Suma en ms de las pausas finalizadas.
  pausasFinalizadasMs: number;
}

export interface LineaSnapshot {
  /// ISO del server al momento del request — el cliente lo usa para ajustar
  /// drift de reloj al calcular el timer.
  serverNow: string;
  ordenActual: LineaOrden | null;
  ordenAnterior: LineaOrden | null;
  /// Próximas OTs en cola. Por convención el primero es la "siguiente
  /// inmediata"; le sigue la "siguiente de la siguiente". Hoy devolvemos hasta 2.
  ordenesSiguientes: LineaOrden[];
}

type OrdenRow = NonNullable<Awaited<ReturnType<typeof prisma.ordenTrabajo.findFirst>>> & {
  articulo: { codigo: string; descripcion: string | null; cliente: { nombre: string } };
  pausas: { id: string; inicio: Date; fin: Date | null }[];
};

function shapeOrden(it: OrdenRow): LineaOrden {
  const pausaActiva = it.pausas.find((p) => p.fin === null) ?? null;
  const pausasFinalizadasMs = it.pausas
    .filter((p) => p.fin !== null)
    .reduce((acc, p) => acc + (p.fin!.getTime() - p.inicio.getTime()), 0);
  return {
    id: it.id,
    numero: it.numero,
    estado: it.estado,
    tipo: it.tipo,
    color: it.color,
    cantidad: it.cantidad,
    piezasPorPercha: it.piezasPorPercha,
    velocidadLavado: it.velocidadLavado,
    inicioProgramado: it.inicioProgramado.toISOString(),
    inicioTeorico: it.inicioTeorico.toISOString(),
    finTeorico: it.finTeorico.toISOString(),
    duracionTeoricaSeg: Math.round((it.finTeorico.getTime() - it.inicioTeorico.getTime()) / 1000),
    inicioReal: it.inicioReal?.toISOString() ?? null,
    finReal: it.finReal?.toISOString() ?? null,
    articulo: { codigo: it.articulo.codigo, descripcion: it.articulo.descripcion },
    cliente: { nombre: it.articulo.cliente.nombre },
    pausaActiva: pausaActiva ? { id: pausaActiva.id, inicio: pausaActiva.inicio.toISOString() } : null,
    pausasFinalizadasMs,
  };
}

const includeFull = {
  articulo: { include: { cliente: true } },
  pausas: { orderBy: { inicio: "asc" as const } },
};

export async function resolverLineaSnapshot(): Promise<LineaSnapshot> {
  // Buscamos la OT EN_CURSO; si no hay, la PENDIENTE más próxima.
  let actualRaw = await prisma.ordenTrabajo.findFirst({
    where: { estado: "EN_CURSO" },
    orderBy: { inicioProgramado: "asc" },
    include: includeFull,
  });

  if (!actualRaw) {
    actualRaw = await prisma.ordenTrabajo.findFirst({
      where: { estado: "PENDIENTE" },
      orderBy: { inicioProgramado: "asc" },
      include: includeFull,
    });
  }

  const ordenActual = actualRaw ? shapeOrden(actualRaw) : null;

  // Anterior = última FINALIZADA (por finReal desc).
  const anteriorRaw = await prisma.ordenTrabajo.findFirst({
    where: { estado: "FINALIZADO" },
    orderBy: { finReal: "desc" },
    include: includeFull,
  });
  const ordenAnterior = anteriorRaw ? shapeOrden(anteriorRaw) : null;

  // Siguientes = próximas PENDIENTE, excluyendo la actual si quedó como
  // "actual por ser pendiente más próxima".
  const ordenesSiguientes: LineaOrden[] = [];
  if (ordenActual) {
    const nexts = await prisma.ordenTrabajo.findMany({
      where: {
        estado: "PENDIENTE",
        id: { not: ordenActual.id },
        inicioProgramado: { gte: actualRaw!.inicioProgramado },
      },
      orderBy: { inicioProgramado: "asc" },
      take: 2,
      include: includeFull,
    });
    for (const n of nexts) ordenesSiguientes.push(shapeOrden(n));
  } else {
    // No hay nada actual: mostramos las próximas 2 pendientes igual.
    const nexts = await prisma.ordenTrabajo.findMany({
      where: { estado: "PENDIENTE" },
      orderBy: { inicioProgramado: "asc" },
      take: 2,
      include: includeFull,
    });
    for (const n of nexts) ordenesSiguientes.push(shapeOrden(n));
  }

  return {
    serverNow: new Date().toISOString(),
    ordenActual,
    ordenAnterior,
    ordenesSiguientes,
  };
}
