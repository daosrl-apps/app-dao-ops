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
import { obtenerTurnos, turnoQueContiene } from "@/lib/turnos";

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
  /// Suma en ms de las pausas finalizadas (usa el override de duración si existe).
  pausasFinalizadasMs: number;
  /// Última pausa cerrada (para el botón "editar minutos" al reanudar).
  ultimaPausaCerrada: { id: string; durSeg: number } | null;
}

export interface LineaAgenda {
  /// ISO del server al momento del request (para mostrar fechas coherentes).
  serverNow: string;
  /// OTs cuyo inicio programado cae en el día de hoy (orden cronológico).
  hoy: LineaOrden[];
  /// OTs cuyo inicio programado cae en el día siguiente (orden cronológico).
  manana: LineaOrden[];
}

export interface LineaSnapshot {
  /// ISO del server al momento del request — el cliente lo usa para ajustar
  /// drift de reloj al calcular el timer.
  serverNow: string;
  /// true si en este momento la fábrica está cerrada (no hay ninguna ventana de
  /// jornada vigente). La TV muestra "Fábrica cerrada" en vez de una OT futura.
  fabricaCerrada: boolean;
  ordenActual: LineaOrden | null;
  ordenAnterior: LineaOrden | null;
  /// Próximas OTs en cola. Por convención el primero es la "siguiente
  /// inmediata"; le sigue la "siguiente de la siguiente". Hoy devolvemos hasta 2.
  ordenesSiguientes: LineaOrden[];
}

type PausaRow = { id: string; inicio: Date; fin: Date | null; duracionOverrideSeg: number | null };

type OrdenRow = NonNullable<Awaited<ReturnType<typeof prisma.ordenTrabajo.findFirst>>> & {
  articulo: { codigo: string; descripcion: string | null; cliente: { nombre: string } };
  pausas: PausaRow[];
};

/** Duración en ms de una pausa cerrada: usa el override manual si está seteado. */
function duracionPausaMs(p: PausaRow): number {
  if (p.duracionOverrideSeg != null) return p.duracionOverrideSeg * 1000;
  if (p.fin === null) return 0;
  return p.fin.getTime() - p.inicio.getTime();
}

function shapeOrden(it: OrdenRow): LineaOrden {
  const pausaActiva = it.pausas.find((p) => p.fin === null) ?? null;
  const cerradas = it.pausas.filter((p) => p.fin !== null);
  const pausasFinalizadasMs = cerradas.reduce((acc, p) => acc + duracionPausaMs(p), 0);
  const ultima = cerradas.length > 0 ? cerradas[cerradas.length - 1] : null;
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
    ultimaPausaCerrada: ultima
      ? { id: ultima.id, durSeg: Math.round(duracionPausaMs(ultima) / 1000) }
      : null,
  };
}

const includeFull = {
  articulo: { include: { cliente: true } },
  pausas: { orderBy: { inicio: "asc" as const } },
};

export async function resolverLineaSnapshot(): Promise<LineaSnapshot> {
  // Ventana de jornada vigente: si `now` no cae en ninguna, la fábrica está
  // cerrada y no debemos mostrar una OT futura como "actual" (bug TV #10).
  const ahora = new Date();
  const turnos = await obtenerTurnos();
  const ventanaActual = turnoQueContiene(turnos, ahora);
  const fabricaCerrada = ventanaActual === null;

  // Buscamos la OT EN_CURSO; si no hay, la PENDIENTE más próxima.
  let actualRaw = await prisma.ordenTrabajo.findFirst({
    where: { estado: "EN_CURSO" },
    orderBy: { inicioProgramado: "asc" },
    include: includeFull,
  });

  if (!actualRaw) {
    const proxima = await prisma.ordenTrabajo.findFirst({
      where: { estado: "PENDIENTE" },
      orderBy: { inicioProgramado: "asc" },
      include: includeFull,
    });
    // Solo la promovemos a "actual" si la fábrica está abierta y la OT pertenece
    // a la ventana de jornada vigente (su inicio cae antes del cierre actual).
    // Si arranca en una ventana futura (p. ej. mañana) o la fábrica está cerrada,
    // dejamos `ordenActual = null` (rectángulo vacío) y la mostramos como próxima.
    if (
      proxima &&
      ventanaActual !== null &&
      proxima.inicioProgramado.getTime() < ventanaActual.fin.getTime()
    ) {
      actualRaw = proxima;
    }
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
    serverNow: ahora.toISOString(),
    fabricaCerrada,
    ordenActual,
    ordenAnterior,
    ordenesSiguientes,
  };
}

/**
 * Agenda del operario: las OTs (no canceladas) cuyo `inicioProgramado` cae hoy o
 * mañana, separadas por día. Es solo-lectura: sirve para que el operario vea qué
 * viene en la jornada y la siguiente. Los límites de día se calculan en la zona
 * horaria del proceso (el contenedor corre con TZ=America/Argentina/Buenos_Aires).
 */
export async function resolverAgendaDia(): Promise<LineaAgenda> {
  const ahora = new Date();
  const inicioHoy = new Date(ahora);
  inicioHoy.setHours(0, 0, 0, 0);
  const inicioManana = new Date(inicioHoy);
  inicioManana.setDate(inicioManana.getDate() + 1);
  const finManana = new Date(inicioHoy);
  finManana.setDate(finManana.getDate() + 2);

  const rows = await prisma.ordenTrabajo.findMany({
    where: {
      estado: { not: "CANCELADO" },
      inicioProgramado: { gte: inicioHoy, lt: finManana },
    },
    orderBy: { inicioProgramado: "asc" },
    include: includeFull,
  });

  const hoy: LineaOrden[] = [];
  const manana: LineaOrden[] = [];
  for (const r of rows) {
    if (r.inicioProgramado.getTime() < inicioManana.getTime()) hoy.push(shapeOrden(r));
    else manana.push(shapeOrden(r));
  }

  return { serverNow: ahora.toISOString(), hoy, manana };
}
