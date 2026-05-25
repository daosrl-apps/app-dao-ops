/**
 * Helpers de dominio para PCPs:
 *   - jornadaToInicio: a partir de (fecha, jornada) calcula el Date inicial.
 *   - planificarItems: dado un array de ítems planos, devuelve los items con
 *     `inicioTeorico` / `finTeorico` calculados (sin tocar la DB).
 */
import type { Jornada } from "@prisma/client";
import { planificar, type ItemPlan } from "@/lib/schedule";

const JORNADA_INICIO_HORA: Record<Jornada, number> = {
  J_06_14: 6,
  J_14_22: 14,
  J_22_06: 22,
  J_06_18: 6,
  J_18_06: 18,
};

export function jornadaInicioHora(jornada: Jornada): number {
  return JORNADA_INICIO_HORA[jornada];
}

/**
 * `fecha` debe ser un Date "del día" (la hora se ignora). El resultado tiene
 * la hora de inicio de la jornada.
 */
export function inicioDeJornada(fecha: Date, jornada: Jornada): Date {
  const hora = jornadaInicioHora(jornada);
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), hora, 0, 0, 0);
}

export interface ItemPlanInput {
  index: number;
  cantidad: number;
  piezasPorHora: number;
  color: string;
  configPerchas: string | null | undefined;
  incluyeLavado: boolean;
  piezasPorPercha: number | null | undefined;
  velocidadLavado: number | null | undefined;
}

export function toItemPlan(item: ItemPlanInput): ItemPlan {
  return {
    index: item.index,
    cantidadPiezas: item.cantidad,
    piezasPorHora: item.piezasPorHora,
    color: item.color,
    configPerchas: item.configPerchas ?? null,
    incluyeLavado: item.incluyeLavado,
    piezasPorPercha: item.piezasPorPercha ?? null,
    velocidadLavado: item.velocidadLavado ?? null,
  };
}

export function planificarItems(items: ItemPlanInput[], inicio: Date) {
  return planificar(items.map(toItemPlan), inicio);
}
