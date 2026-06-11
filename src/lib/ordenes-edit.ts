/**
 * Helpers de servidor para editar OTs ya creadas (dividir en 2 / corregir
 * cantidad). Viven acá para no duplicar el cálculo de duración ni el
 * recompactado de la cola entre `/api/ordenes/[id]` (PATCH) y
 * `/api/ordenes/[id]/split` (POST).
 *
 * `schedule.ts` se mantiene libre de DB (funciones puras testeables); este
 * módulo es el pegamento con Prisma.
 */
import type { Prisma } from "@prisma/client";
import { duracionItem, type ItemCalculable } from "@/lib/schedule";

/**
 * Duración teórica (segundos) de una OT para una `cantidad` dada, reusando la
 * misma fórmula que la creación (pintura: cantidad/piezasPorHora; lavado:
 * vueltas del circuito). Los parámetros de lavado se ignoran si la OT es
 * PINTURA y viceversa.
 */
export function duracionOrdenSeg(args: {
  tipo: "LAVADO" | "PINTURA";
  cantidad: number;
  piezasPorHora: number;
  color: string;
  configPerchas: string | null;
  piezasPorPercha: number | null;
  velocidadLavado: number | null;
}): number {
  const ic: ItemCalculable = {
    tipo: args.tipo,
    cantidadPiezas: args.cantidad,
    piezasPorHora: args.piezasPorHora,
    color: args.color,
    configPerchas: args.configPerchas,
    piezasPorPercha: args.tipo === "LAVADO" ? args.piezasPorPercha : null,
    velocidadLavado: args.tipo === "LAVADO" ? args.velocidadLavado : null,
  };
  return duracionItem(ic).totalSeg;
}

/**
 * Recompacta las OTs PENDIENTE posteriores a `inicioProgramadoRef`
 * desplazándolas `deltaMs` (positivo = más tarde, negativo = más temprano).
 * Misma mecánica que el recompactado al borrar una OT: solo se mueven las
 * PENDIENTE; las EN_CURSO / FINALIZADO quedan donde están.
 */
export async function desplazarPosteriores(
  tx: Prisma.TransactionClient,
  inicioProgramadoRef: Date,
  deltaMs: number,
): Promise<void> {
  if (deltaMs === 0) return;
  const posteriores = await tx.ordenTrabajo.findMany({
    where: { estado: "PENDIENTE", inicioProgramado: { gt: inicioProgramadoRef } },
    select: { id: true, inicioProgramado: true, inicioTeorico: true, finTeorico: true },
  });
  for (const p of posteriores) {
    await tx.ordenTrabajo.update({
      where: { id: p.id },
      data: {
        inicioProgramado: new Date(p.inicioProgramado.getTime() + deltaMs),
        inicioTeorico: new Date(p.inicioTeorico.getTime() + deltaMs),
        finTeorico: new Date(p.finTeorico.getTime() + deltaMs),
      },
    });
  }
}
