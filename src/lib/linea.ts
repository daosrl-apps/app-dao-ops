/**
 * Snapshot de la línea de producción.
 *
 * "Actual" = el ítem que el operario está trabajando ahora (EN_CURSO).
 * Si no hay nada EN_CURSO, devolvemos el siguiente PENDIENTE más próximo en
 * los PCPs PENDIENTE/EN_CURSO (ordenados por inicio).
 *
 * "Anterior" y "siguiente" se resuelven dentro del mismo PCP que el actual.
 */
import { prisma } from "@/lib/db";

export interface LineaItem {
  id: string;
  pcpId: string;
  orden: number;
  estado: string;
  tipo: "LAVADO" | "PINTURA";
  color: string;
  cantidad: number;
  incluyeLavado: boolean;
  piezasPorPercha: number | null;
  velocidadLavado: number | null;
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
  itemActual: LineaItem | null;
  itemAnterior: LineaItem | null;
  /// Próximos ítems en cola. Por convención el primero es el "siguiente
  /// inmediato"; le sigue el "siguiente del siguiente". Hoy devolvemos hasta 2.
  itemsSiguientes: LineaItem[];
}

async function buildItem(itemId: string): Promise<LineaItem | null> {
  const it = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      articulo: { include: { cliente: true } },
      pausas: { orderBy: { inicio: "asc" } },
    },
  });
  if (!it) return null;
  return shapeItem(it);
}

function shapeItem(
  it: NonNullable<Awaited<ReturnType<typeof prisma.item.findFirst>>> & {
    articulo: { codigo: string; descripcion: string | null; cliente: { nombre: string } };
    pausas: { id: string; inicio: Date; fin: Date | null }[];
  },
): LineaItem {
  const pausaActiva = it.pausas.find((p) => p.fin === null) ?? null;
  const pausasFinalizadasMs = it.pausas
    .filter((p) => p.fin !== null)
    .reduce((acc, p) => acc + (p.fin!.getTime() - p.inicio.getTime()), 0);
  return {
    id: it.id,
    pcpId: it.pcpId,
    orden: it.orden,
    estado: it.estado,
    tipo: it.tipo,
    color: it.color,
    cantidad: it.cantidad,
    incluyeLavado: it.incluyeLavado,
    piezasPorPercha: it.piezasPorPercha,
    velocidadLavado: it.velocidadLavado,
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

export async function resolverLineaSnapshot(): Promise<LineaSnapshot> {
  // Buscamos primer ítem EN_CURSO; si no hay, primer PENDIENTE de un PCP
  // activo, ordenado por (pcp.inicio asc, item.orden asc).
  const enCurso = await prisma.item.findFirst({
    where: { estado: "EN_CURSO" },
    orderBy: [{ pcp: { inicio: "asc" } }, { orden: "asc" }],
    include: {
      articulo: { include: { cliente: true } },
      pausas: { orderBy: { inicio: "asc" } },
    },
  });

  let actualRaw = enCurso;
  if (!actualRaw) {
    actualRaw = await prisma.item.findFirst({
      where: {
        estado: "PENDIENTE",
        pcp: { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
      },
      orderBy: [{ pcp: { inicio: "asc" } }, { orden: "asc" }],
      include: {
        articulo: { include: { cliente: true } },
        pausas: { orderBy: { inicio: "asc" } },
      },
    });
  }

  const itemActual = actualRaw ? shapeItem(actualRaw) : null;

  let itemAnterior: LineaItem | null = null;
  const itemsSiguientes: LineaItem[] = [];

  if (itemActual) {
    const prev = await prisma.item.findFirst({
      where: { pcpId: itemActual.pcpId, orden: { lt: itemActual.orden } },
      orderBy: { orden: "desc" },
      include: {
        articulo: { include: { cliente: true } },
        pausas: { orderBy: { inicio: "asc" } },
      },
    });
    if (prev) itemAnterior = shapeItem(prev);

    // Siguientes dentro del mismo PCP, hasta 2.
    const nexts = await prisma.item.findMany({
      where: { pcpId: itemActual.pcpId, orden: { gt: itemActual.orden } },
      orderBy: { orden: "asc" },
      take: 2,
      include: {
        articulo: { include: { cliente: true } },
        pausas: { orderBy: { inicio: "asc" } },
      },
    });
    for (const n of nexts) itemsSiguientes.push(shapeItem(n));

    // Si me faltan siguientes en este PCP, sumo del próximo PCP en cola.
    if (itemsSiguientes.length < 2) {
      const sigPcps = await prisma.item.findMany({
        where: {
          estado: "PENDIENTE",
          pcp: { id: { not: itemActual.pcpId }, estado: { in: ["PENDIENTE", "EN_CURSO"] } },
        },
        orderBy: [{ pcp: { inicio: "asc" } }, { orden: "asc" }],
        take: 2 - itemsSiguientes.length,
        include: {
          articulo: { include: { cliente: true } },
          pausas: { orderBy: { inicio: "asc" } },
        },
      });
      for (const n of sigPcps) itemsSiguientes.push(shapeItem(n));
    }
  } else {
    // No hay nada en curso ni pendiente: buscamos el último finalizado para
    // mostrar de qué venimos.
    const ultimoFin = await prisma.item.findFirst({
      where: { estado: "FINALIZADO" },
      orderBy: { finReal: "desc" },
      include: {
        articulo: { include: { cliente: true } },
        pausas: { orderBy: { inicio: "asc" } },
      },
    });
    if (ultimoFin) itemAnterior = shapeItem(ultimoFin);
  }

  return {
    serverNow: new Date().toISOString(),
    itemActual,
    itemAnterior,
    itemsSiguientes,
  };
}

export { buildItem };
