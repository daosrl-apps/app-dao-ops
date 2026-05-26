/**
 * Helpers de dominio para PCPs:
 *   - jornadaToInicio: a partir de (fecha, jornada) calcula el Date inicial.
 *   - planificarItems: dado un array de ítems ya con su tipo (LAVADO/PINTURA),
 *     devuelve los items con `inicioTeorico` / `finTeorico` calculados.
 *   - splitItemConLavado: del input del wizard ("incluye lavado") genera los
 *     1 o 2 registros necesarios (LAVADO + PINTURA).
 */
import type { Jornada } from "@prisma/client";
import { planificar, type ItemPlan, type ItemTipo } from "@/lib/schedule";

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
  tipo: ItemTipo;
  cantidad: number;
  piezasPorHora: number;
  color: string;
  configPerchas: string | null | undefined;
  piezasPorPercha: number | null | undefined;
  velocidadLavado: number | null | undefined;
}

export function toItemPlan(item: ItemPlanInput): ItemPlan {
  return {
    index: item.index,
    tipo: item.tipo,
    cantidadPiezas: item.cantidad,
    piezasPorHora: item.piezasPorHora,
    color: item.color,
    configPerchas: item.configPerchas ?? null,
    piezasPorPercha: item.piezasPorPercha ?? null,
    velocidadLavado: item.velocidadLavado ?? null,
  };
}

export function planificarItems(items: ItemPlanInput[], inicio: Date) {
  return planificar(items.map(toItemPlan), inicio);
}

/**
 * Input del wizard de PCP. Cada uno puede generar 1 o 2 ItemPlanInput
 * (LAVADO + PINTURA si `incluyeLavado` está prendido).
 */
export interface ItemBorradorInput {
  articuloId: string;
  piezasPorHora: number;
  configPerchas: string | null;
  color: string;
  cantidad: number;
  incluyeLavado: boolean;
  piezasPorPercha: number | null;
  velocidadLavado: number | null;
}

/**
 * Convierte un ítem del wizard en uno o dos ItemPlanInput con sus tipos.
 * Si incluyeLavado=true, devuelve [LAVADO, PINTURA] en ese orden. La
 * normalización del orden final (todos los LAVADO antes que PINTURA) la hace
 * el optimizer o el supervisor manualmente.
 */
export function splitItemConLavado(
  input: ItemBorradorInput,
  baseIndex: number,
): Array<Omit<ItemPlanInput, "index"> & { offset: number }> {
  const out: Array<Omit<ItemPlanInput, "index"> & { offset: number }> = [];
  if (input.incluyeLavado) {
    out.push({
      offset: 0,
      tipo: "LAVADO",
      cantidad: input.cantidad,
      piezasPorHora: input.piezasPorHora,
      color: input.color,
      configPerchas: input.configPerchas,
      piezasPorPercha: input.piezasPorPercha,
      velocidadLavado: input.velocidadLavado,
    });
  }
  out.push({
    offset: out.length,
    tipo: "PINTURA",
    cantidad: input.cantidad,
    piezasPorHora: input.piezasPorHora,
    color: input.color,
    configPerchas: input.configPerchas,
    piezasPorPercha: null,
    velocidadLavado: null,
  });
  void baseIndex;
  return out;
}
