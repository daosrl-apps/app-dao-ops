/**
 * Cálculo de métricas de producción.
 *
 * Soporta un rango configurable (inicio/fin) y compara contra una ventana
 * "anterior" del mismo largo. Default: últimos 7 días vs 7 anteriores.
 */
import { prisma } from "@/lib/db";

export interface Delta {
  actual: number;
  anterior: number;
  /// Diferencia absoluta (actual - anterior).
  delta: number;
  /// Porcentaje (delta / anterior * 100). Null si anterior = 0.
  pct: number | null;
}

function delta(actual: number, anterior: number): Delta {
  return {
    actual,
    anterior,
    delta: actual - anterior,
    pct: anterior === 0 ? null : ((actual - anterior) / anterior) * 100,
  };
}

export interface Ventana {
  inicio: Date;
  fin: Date;
}

export function resolverVentanas(actual: Ventana): { actual: Ventana; anterior: Ventana } {
  const lenMs = actual.fin.getTime() - actual.inicio.getTime();
  const finAnt = new Date(actual.inicio);
  const inicioAnt = new Date(finAnt.getTime() - lenMs);
  return { actual, anterior: { inicio: inicioAnt, fin: finAnt } };
}

/** Helper: últimos 7 días (ventana actual) y los 7 previos. */
export function ventanaUltimaSemana(ref: Date = new Date()): Ventana {
  const fin = ref;
  const inicio = new Date(fin);
  inicio.setDate(inicio.getDate() - 7);
  return { inicio, fin };
}

export interface MetricasSnapshot {
  ventana: { actual: { inicio: string; fin: string }; anterior: { inicio: string; fin: string } };
  ordenesTotales: Delta;
  piezasPintadas: Delta;
  ordenesIncumplidas: Delta;
  cambiosColor: Delta;
  cambiosPercha: Delta;
  piezasLavadas: Delta;
  piezasPorColor: { color: string; cantidad: number }[];
  m2PorColor: { color: string; m2: number }[];
  piezasPorCliente: { cliente: string; cantidad: number }[];
  /// Tabla detalle de OTs FINALIZADAS en la ventana actual.
  detalle: {
    fecha: string;
    cliente: string;
    articulo: string;
    color: string;
    cantidad: number;
    duracionTeoricaMin: number;
    duracionRealMin: number;
    desviacionPct: number;
  }[];
}

export async function calcularMetricas(rango?: Ventana): Promise<MetricasSnapshot> {
  const { actual, anterior } = resolverVentanas(rango ?? ventanaUltimaSemana());

  const [actualData, anteriorData] = await Promise.all([
    cargarVentana(actual.inicio, actual.fin),
    cargarVentana(anterior.inicio, anterior.fin),
  ]);

  // Por color (piezas): solo PINTURA.
  const porColor = new Map<string, number>();
  for (const it of actualData.items) {
    porColor.set(it.color, (porColor.get(it.color) ?? 0) + it.cantidad);
  }
  const piezasPorColor = Array.from(porColor.entries())
    .map(([color, cantidad]) => ({ color, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // m² por color: cantidad × superficieM2 (solo PINTURA y solo si superficie > 0).
  const m2Color = new Map<string, number>();
  for (const it of actualData.items) {
    if (it.superficieM2 == null || it.superficieM2 <= 0) continue;
    const m2 = it.cantidad * it.superficieM2;
    m2Color.set(it.color, (m2Color.get(it.color) ?? 0) + m2);
  }
  const m2PorColor = Array.from(m2Color.entries())
    .map(([color, m2]) => ({ color, m2: Math.round(m2 * 100) / 100 }))
    .sort((a, b) => b.m2 - a.m2);

  // Por cliente: agregamos sobre actual.
  const porCliente = new Map<string, number>();
  for (const it of actualData.items) {
    porCliente.set(it.cliente, (porCliente.get(it.cliente) ?? 0) + it.cantidad);
  }
  const piezasPorCliente = Array.from(porCliente.entries())
    .map(([cliente, cantidad]) => ({ cliente, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // Detalle: OTs FINALIZADAS en la ventana actual con su desviación.
  const detalle = actualData.itemsFinalizados.map((it) => ({
    fecha: it.finReal.toISOString().slice(0, 10),
    cliente: it.cliente,
    articulo: it.articulo,
    color: it.color,
    cantidad: it.cantidad,
    duracionTeoricaMin: Math.round(it.duracionTeoricaSeg / 60),
    duracionRealMin: Math.round(it.duracionRealSeg / 60),
    desviacionPct:
      it.duracionTeoricaSeg > 0
        ? Math.round(
            ((it.duracionRealSeg - it.duracionTeoricaSeg) / it.duracionTeoricaSeg) * 100,
          )
        : 0,
  }));

  return {
    ventana: {
      actual: { inicio: actual.inicio.toISOString(), fin: actual.fin.toISOString() },
      anterior: { inicio: anterior.inicio.toISOString(), fin: anterior.fin.toISOString() },
    },
    ordenesTotales: delta(actualData.totalOrdenes, anteriorData.totalOrdenes),
    piezasPintadas: delta(actualData.piezasPintadas, anteriorData.piezasPintadas),
    ordenesIncumplidas: delta(actualData.incumplidas, anteriorData.incumplidas),
    cambiosColor: delta(actualData.cambiosColor, anteriorData.cambiosColor),
    cambiosPercha: delta(actualData.cambiosPercha, anteriorData.cambiosPercha),
    piezasLavadas: delta(actualData.piezasLavadas, anteriorData.piezasLavadas),
    piezasPorColor,
    m2PorColor,
    piezasPorCliente,
    detalle,
  };
}

interface VentanaData {
  totalOrdenes: number;
  piezasPintadas: number;
  piezasLavadas: number;
  incumplidas: number;
  cambiosColor: number;
  cambiosPercha: number;
  items: { color: string; cliente: string; cantidad: number; superficieM2: number | null }[];
  itemsFinalizados: {
    finReal: Date;
    cliente: string;
    articulo: string;
    color: string;
    cantidad: number;
    duracionTeoricaSeg: number;
    duracionRealSeg: number;
  }[];
}

async function cargarVentana(inicio: Date, fin: Date): Promise<VentanaData> {
  // Tomamos OTs cuyo inicioProgramado cae en la ventana. Para cambios de
  // color/perchas las ordenamos por inicio (ese es el orden con el que pasan
  // por la línea).
  const ordenes = await prisma.ordenTrabajo.findMany({
    where: { inicioProgramado: { gte: inicio, lte: fin } },
    orderBy: { inicioProgramado: "asc" },
    include: { articulo: { include: { cliente: true } } },
  });

  let piezasPintadas = 0;
  let piezasLavadas = 0;
  let incumplidas = 0;
  let cambiosColor = 0;
  let cambiosPercha = 0;
  const items: VentanaData["items"] = [];
  const itemsFinalizados: VentanaData["itemsFinalizados"] = [];

  let prevColor: string | null = null;
  let prevPerchas: string | null = null;

  for (const ot of ordenes) {
    if (ot.estado === "FINALIZADO" && ot.inicioReal && ot.finReal) {
      if (ot.tipo === "PINTURA") piezasPintadas += ot.cantidad;
      if (ot.tipo === "LAVADO") piezasLavadas += ot.cantidad;

      const dTeo = (ot.finTeorico.getTime() - ot.inicioTeorico.getTime()) / 1000;
      const dReal = (ot.finReal.getTime() - ot.inicioReal.getTime()) / 1000;
      if (dTeo > 0 && dReal > dTeo * 1.15) incumplidas++;

      itemsFinalizados.push({
        finReal: ot.finReal,
        cliente: ot.articulo.cliente.nombre,
        articulo: ot.articulo.codigo,
        color: ot.tipo === "PINTURA" ? ot.color : "(lavado)",
        cantidad: ot.cantidad,
        duracionTeoricaSeg: dTeo,
        duracionRealSeg: dReal,
      });
    }

    // Para el pie de "piezas por color" y "m² por color" solo cuentan PINTURA.
    if (ot.tipo === "PINTURA") {
      items.push({
        color: ot.color,
        cliente: ot.articulo.cliente.nombre,
        cantidad: ot.cantidad,
        superficieM2: ot.articulo.superficieM2 ?? null,
      });

      // Cambios entre PINTURA consecutivas.
      if (prevColor !== null && prevColor !== ot.color) cambiosColor++;
      const perchasActuales = ot.configPerchas ?? "";
      if (prevPerchas !== null && prevPerchas !== perchasActuales) cambiosPercha++;
      prevColor = ot.color;
      prevPerchas = perchasActuales;
    }
  }

  // Solo contamos órdenes finalizadas como "ordenes totales".
  const totalOrdenes = ordenes.filter((o) => o.estado === "FINALIZADO").length;

  return {
    totalOrdenes,
    piezasPintadas,
    piezasLavadas,
    incumplidas,
    cambiosColor,
    cambiosPercha,
    items,
    itemsFinalizados,
  };
}
