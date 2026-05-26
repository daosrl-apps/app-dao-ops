/**
 * Cálculo de tiempos del PCP (sección 5 de la spec).
 *
 * Centralizado acá para que la lógica viva en un solo lugar y sea fácil de
 * testear sin DB ni server.
 *
 * Convenciones:
 *  - Todos los tiempos internos se manejan en SEGUNDOS.
 *  - El encadenamiento de ítems devuelve Date para los hitos (inicio/fin).
 */

// ---- Constantes del lavado (sección 5.4) -----------------------------------

/// Largo total de la línea de lavado (circuito cerrado).
export const LARGO_LAVADO_M = 84;
/// Cantidad de perchas distribuidas uniformemente.
export const PERCHAS_LAVADO = 200;
/// Separación entre perchas: 84 / 200 = 0.42 m.
export const SEPARACION_PERCHAS_M = LARGO_LAVADO_M / PERCHAS_LAVADO;

// ---- Tiempos de cambio (sección 5.2) ---------------------------------------

/// Cambio de color: 30 min.
export const CAMBIO_COLOR_SEG = 30 * 60;
/// Cambio de perchas: 45 min (también es el máx si coinciden ambos cambios).
export const CAMBIO_PERCHAS_SEG = 45 * 60;

// =============================================================================
// Tiempo de pintura
// =============================================================================

/**
 * tiempo_pintura (segundos) = cantidad / piezas_por_hora * 3600
 */
export function tiempoPinturaSeg(cantidadPiezas: number, piezasPorHora: number): number {
  if (piezasPorHora <= 0) {
    throw new Error("piezasPorHora debe ser > 0");
  }
  if (cantidadPiezas < 0) {
    throw new Error("cantidadPiezas debe ser >= 0");
  }
  return (cantidadPiezas / piezasPorHora) * 3600;
}

// =============================================================================
// Tiempo de lavado (circuito cerrado)
// =============================================================================

/**
 * perchas_necesarias = techo(cantidad / piezas_por_percha)
 * tiempo_lavado (seg) = [ 84 + (perchas_necesarias - 1) * 0.42 ] / velocidad
 *
 * La fórmula es válida incluso si perchas_necesarias > 200 (el "tren" de
 * perchas es más largo que la línea física pero el circuito no para).
 */
export function tiempoLavadoSeg(
  cantidadPiezas: number,
  piezasPorPercha: number,
  velocidadMs: number,
): number {
  if (piezasPorPercha <= 0) throw new Error("piezasPorPercha debe ser > 0");
  if (velocidadMs <= 0) throw new Error("velocidadMs debe ser > 0");
  if (cantidadPiezas < 0) throw new Error("cantidadPiezas debe ser >= 0");

  const perchasNecesarias = Math.ceil(cantidadPiezas / piezasPorPercha);
  if (perchasNecesarias === 0) return 0;
  return (LARGO_LAVADO_M + (perchasNecesarias - 1) * SEPARACION_PERCHAS_M) / velocidadMs;
}

// =============================================================================
// Tiempo de cambio entre ítems consecutivos
// =============================================================================

export interface ItemParaCambio {
  tipo: ItemTipo;
  color: string;
  /** Identificador de configuración de perchas. Null/undefined = "sin info";
   *  dos ítems con el mismo valor no disparan cambio de perchas. */
  configPerchas?: string | null;
}

/**
 * Tiempo de cambio entre `anterior` y `siguiente`:
 *  - Solo aplica si AMBOS ítems son PINTURA. Entre LAVADO no hay cambios (es
 *    una sola línea de lavado, contínua), y al pasar de LAVADO a PINTURA
 *    estamos cambiando de estación física: tampoco se contabiliza como cambio
 *    de la línea de pintura.
 *  - Entre PINTURA y PINTURA:
 *      - cambio de color → 30 min
 *      - cambio de perchas → 45 min
 *      - ambos → solo el mayor (NO suma) → 45 min
 *      - ninguno → 0
 */
export function tiempoCambioSeg(anterior: ItemParaCambio, siguiente: ItemParaCambio): number {
  if (anterior.tipo !== "PINTURA" || siguiente.tipo !== "PINTURA") return 0;

  const cambiaColor = normalizarColor(anterior.color) !== normalizarColor(siguiente.color);
  const cambiaPerchas =
    normalizarPerchas(anterior.configPerchas) !== normalizarPerchas(siguiente.configPerchas);

  if (cambiaColor && cambiaPerchas) return CAMBIO_PERCHAS_SEG;
  if (cambiaPerchas) return CAMBIO_PERCHAS_SEG;
  if (cambiaColor) return CAMBIO_COLOR_SEG;
  return 0;
}

function normalizarColor(c: string): string {
  return c.trim().toLowerCase();
}

function normalizarPerchas(c: string | null | undefined): string {
  return (c ?? "").trim().toLowerCase();
}

// =============================================================================
// Duración total de un ítem (lavado + pintura)
// =============================================================================

export type ItemTipo = "LAVADO" | "PINTURA";

export interface ItemCalculable {
  /// LAVADO o PINTURA — define qué etapa cubre el ítem.
  tipo: ItemTipo;
  cantidadPiezas: number;
  /// Aplica a PINTURA. Si tipo=LAVADO se ignora.
  piezasPorHora: number;
  /// Aplican a LAVADO. Si tipo=PINTURA se ignoran.
  piezasPorPercha?: number | null;
  velocidadLavado?: number | null;
  /// Aplica a PINTURA. En LAVADO no hay color (es lavado de piezas crudas).
  color: string;
  configPerchas?: string | null;
}

export interface DuracionItem {
  pinturaSeg: number;
  lavadoSeg: number;
  /** Total del ítem (solo una etapa: o lavado o pintura). */
  totalSeg: number;
}

export function duracionItem(item: ItemCalculable): DuracionItem {
  if (item.tipo === "LAVADO") {
    if (item.piezasPorPercha == null || item.velocidadLavado == null) {
      throw new Error("Item LAVADO requiere piezasPorPercha y velocidadLavado");
    }
    const lavadoSeg = tiempoLavadoSeg(
      item.cantidadPiezas,
      item.piezasPorPercha,
      item.velocidadLavado,
    );
    return { pinturaSeg: 0, lavadoSeg, totalSeg: lavadoSeg };
  }
  const pinturaSeg = tiempoPinturaSeg(item.cantidadPiezas, item.piezasPorHora);
  return { pinturaSeg, lavadoSeg: 0, totalSeg: pinturaSeg };
}

// =============================================================================
// Encadenamiento: inicio/fin teóricos de cada ítem en el PCP
// =============================================================================

export interface ItemPlan extends ItemCalculable {
  /** Índice de orden — solo informativo, no se reordena acá. */
  index: number;
}

export interface ItemSchedule {
  index: number;
  /** Tiempo de cambio respecto del ítem anterior (0 para el primero). */
  cambioSeg: number;
  duracion: DuracionItem;
  inicio: Date;
  fin: Date;
}

/**
 * Calcula inicio/fin teóricos de todos los ítems a partir del `inicioJornada`,
 * encadenando los tiempos de cambio + duración de cada ítem.
 * El input se respeta tal cual viene (no reordena). Para reordenar, ver
 * `proponerOrdenOptimo`.
 */
export function planificar(items: ItemPlan[], inicioJornada: Date): ItemSchedule[] {
  const result: ItemSchedule[] = [];
  let cursor = inicioJornada.getTime();
  let anterior: ItemPlan | null = null;

  for (const item of items) {
    const cambioSeg = anterior ? tiempoCambioSeg(anterior, item) : 0;
    const dur = duracionItem(item);
    const inicioMs = cursor + cambioSeg * 1000;
    const finMs = inicioMs + dur.totalSeg * 1000;
    result.push({
      index: item.index,
      cambioSeg,
      duracion: dur,
      inicio: new Date(inicioMs),
      fin: new Date(finMs),
    });
    cursor = finMs;
    anterior = item;
  }

  return result;
}

// =============================================================================
// Orden óptimo propuesto (sección 5.1)
// =============================================================================

/**
 * Devuelve los índices del orden propuesto:
 *  1) Todos los LAVADO primero, después todos los PINTURA. La regla de negocio
 *     dice que conviene agrupar los lavados al inicio y después pintar.
 *  2) Dentro de PINTURA: minimizar tiempo total de cambios (color + perchas).
 *  3) Dentro de LAVADO: no hay cambios entre lavados, pero por consistencia
 *     respetamos el orden del input.
 *
 * Estrategia: hasta 7 ítems en un grupo → búsqueda exhaustiva (7! = 5040, OK).
 * A partir de ahí → heurístico greedy "nearest neighbor".
 */
export function proponerOrdenOptimo(items: ItemPlan[]): number[] {
  const lavados = items.filter((i) => i.tipo === "LAVADO");
  const pinturas = items.filter((i) => i.tipo === "PINTURA");
  // En LAVADO no hay tiempo de cambio entre items, así que cualquier orden
  // tiene el mismo costo. Mantenemos el orden del input.
  const ordenLavados = lavados.map((l) => l.index);
  const ordenPinturas = ordenarGrupo(pinturas);
  return [...ordenLavados, ...ordenPinturas];
}

function ordenarGrupo(grupo: ItemPlan[]): number[] {
  if (grupo.length === 0) return [];
  if (grupo.length === 1) return [grupo[0].index];

  if (grupo.length <= 7) {
    return ordenarExhaustivo(grupo);
  }
  return ordenarGreedy(grupo);
}

function ordenarExhaustivo(grupo: ItemPlan[]): number[] {
  let mejorOrden: number[] = grupo.map((g) => g.index);
  let mejorCosto = Infinity;

  const indices = grupo.map((_, i) => i);
  for (const perm of permutaciones(indices)) {
    const costo = costoCambios(perm.map((i) => grupo[i]));
    if (costo < mejorCosto) {
      mejorCosto = costo;
      mejorOrden = perm.map((i) => grupo[i].index);
    }
  }
  return mejorOrden;
}

function ordenarGreedy(grupo: ItemPlan[]): number[] {
  const restantes = [...grupo];
  const out: number[] = [];
  let actual = restantes.shift()!;
  out.push(actual.index);
  while (restantes.length) {
    let mejorIdx = 0;
    let mejorCosto = Infinity;
    for (let i = 0; i < restantes.length; i++) {
      const c = tiempoCambioSeg(actual, restantes[i]);
      if (c < mejorCosto) {
        mejorCosto = c;
        mejorIdx = i;
      }
    }
    actual = restantes.splice(mejorIdx, 1)[0];
    out.push(actual.index);
  }
  return out;
}

function costoCambios(items: ItemPlan[]): number {
  let total = 0;
  for (let i = 1; i < items.length; i++) {
    total += tiempoCambioSeg(items[i - 1], items[i]);
  }
  return total;
}

function* permutaciones<T>(arr: T[]): Generator<T[]> {
  if (arr.length <= 1) {
    yield arr.slice();
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const resto = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const sub of permutaciones(resto)) {
      yield [arr[i], ...sub];
    }
  }
}
