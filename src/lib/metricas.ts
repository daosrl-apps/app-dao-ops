/**
 * Cálculo de métricas de la fase de ejecución (sección 9 de la spec).
 * Todas las comparativas son "semana actual vs semana anterior".
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

export interface VentanaSemana {
  inicio: Date;
  fin: Date;
}

export function semanasActualYAnterior(ref: Date = new Date()): {
  actual: VentanaSemana;
  anterior: VentanaSemana;
} {
  const fin = ref;
  const inicio = new Date(fin);
  inicio.setDate(inicio.getDate() - 7);
  const finAnt = new Date(inicio);
  const inicioAnt = new Date(finAnt);
  inicioAnt.setDate(inicioAnt.getDate() - 7);
  return {
    actual: { inicio, fin },
    anterior: { inicio: inicioAnt, fin: finAnt },
  };
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
  piezasPorCliente: { cliente: string; cantidad: number }[];
  /// Tabla detalle de ítems FINALIZADO en la ventana actual.
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

export async function calcularMetricas(ref: Date = new Date()): Promise<MetricasSnapshot> {
  const { actual, anterior } = semanasActualYAnterior(ref);

  const [actualData, anteriorData] = await Promise.all([
    cargarVentana(actual.inicio, actual.fin),
    cargarVentana(anterior.inicio, anterior.fin),
  ]);

  // Por color: agregamos sobre actual.
  const porColor = new Map<string, number>();
  for (const it of actualData.items) {
    porColor.set(it.color, (porColor.get(it.color) ?? 0) + it.cantidad);
  }
  const piezasPorColor = Array.from(porColor.entries())
    .map(([color, cantidad]) => ({ color, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // Por cliente: agregamos sobre actual.
  const porCliente = new Map<string, number>();
  for (const it of actualData.items) {
    porCliente.set(it.cliente, (porCliente.get(it.cliente) ?? 0) + it.cantidad);
  }
  const piezasPorCliente = Array.from(porCliente.entries())
    .map(([cliente, cantidad]) => ({ cliente, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);

  // Detalle: items finalizados en la ventana actual con su desviación.
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
  items: { color: string; cliente: string; cantidad: number }[];
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
  const pcps = await prisma.pcp.findMany({
    where: { inicio: { gte: inicio, lte: fin } },
    include: {
      items: {
        orderBy: { orden: "asc" },
        include: { articulo: { include: { cliente: true } } },
      },
    },
  });

  let totalOrdenes = pcps.length;
  let piezasPintadas = 0;
  let piezasLavadas = 0;
  let incumplidas = 0;
  let cambiosColor = 0;
  let cambiosPercha = 0;
  const items: { color: string; cliente: string; cantidad: number }[] = [];
  const itemsFinalizados: VentanaData["itemsFinalizados"] = [];

  for (const pcp of pcps) {
    let prevColor: string | null = null;
    let prevPerchas: string | null = null;
    for (const it of pcp.items) {
      // "Piezas pintadas" cuenta solo PINTURA. "Piezas lavadas" cuenta LAVADO.
      // El artículo se cuenta una vez por tipo de ítem.
      if (it.estado === "FINALIZADO" && it.inicioReal && it.finReal) {
        if (it.tipo === "PINTURA") piezasPintadas += it.cantidad;
        if (it.tipo === "LAVADO") piezasLavadas += it.cantidad;

        const dTeo = (it.finTeorico.getTime() - it.inicioTeorico.getTime()) / 1000;
        const dReal = (it.finReal.getTime() - it.inicioReal.getTime()) / 1000;
        if (dTeo > 0 && dReal > dTeo * 1.15) incumplidas++;

        itemsFinalizados.push({
          finReal: it.finReal,
          cliente: it.articulo.cliente.nombre,
          articulo: it.articulo.codigo,
          color: it.tipo === "PINTURA" ? it.color : "(lavado)",
          cantidad: it.cantidad,
          duracionTeoricaSeg: dTeo,
          duracionRealSeg: dReal,
        });
      }

      // Para el pie de "piezas por color" solo cuentan PINTURA.
      if (it.tipo === "PINTURA") {
        items.push({
          color: it.color,
          cliente: it.articulo.cliente.nombre,
          cantidad: it.cantidad,
        });
      }

      // Cambios de color y perchas solo se computan entre items PINTURA
      // consecutivos (los LAVADO ocurren en otra estación).
      if (it.tipo === "PINTURA") {
        if (prevColor !== null && prevColor !== it.color) cambiosColor++;
        const perchasActuales = it.configPerchas ?? "";
        if (prevPerchas !== null && prevPerchas !== perchasActuales) cambiosPercha++;
        prevColor = it.color;
        prevPerchas = perchasActuales;
      }
    }
  }

  // Solo contamos órdenes que tengan al menos un ítem finalizado.
  totalOrdenes = pcps.filter((p) => p.items.some((i) => i.estado === "FINALIZADO")).length;

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
