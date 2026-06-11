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

/// Largo total de la línea de lavado (circuito cerrado), en metros.
export const LARGO_LAVADO_M = 84;
/// Cantidad de perchas distribuidas uniformemente sobre el circuito.
export const PERCHAS_LAVADO = 200;

// ---- Gap entre OTs (regla del 2026-05-27) ---------------------------------
//
// Regla nueva del cliente: entre orden y orden siempre hay 15 min de
// preparación (cambio físico de gancheras). Si además cambia el color, se
// suman 30 min adicionales (= 45 min total). La regla vieja que separaba
// "cambio de color (30)" / "cambio de perchas (45)" como eventos condicionales
// quedó deprecada.

/// Gap base entre dos OTs consecutivas (preparación / cambio de gancheras).
export const GAP_BASE_SEG = 15 * 60;
/// Tiempo adicional si la próxima OT cambia de color respecto de la anterior.
export const CAMBIO_COLOR_SEG = 30 * 60;

/**
 * Redondea una fecha hacia ARRIBA al minuto entero más próximo.
 *
 * El `finTeorico` de una OT casi nunca cae justo en un minuto (las duraciones
 * tienen segundos), pero el formulario de carga maneja la hora con granularidad
 * de minuto (HH:MM) y descarta los segundos al enviar. Si el mínimo permitido
 * fuese `14:23:45`, el form mandaría `14:23:00` y el server lo rechazaría por
 * solapamiento. Redondeando el mínimo a `14:24:00` evitamos ese off-by-segundos.
 */
export function ceilAMinuto(fecha: Date): Date {
  const MIN_MS = 60_000;
  return new Date(Math.ceil(fecha.getTime() / MIN_MS) * MIN_MS);
}

/**
 * Mínimo horario de inicio para una OT nueva, dado el `finTeorico` de la última
 * OT activa y el gap aplicable. Redondeado al minuto (ver `ceilAMinuto`).
 */
export function minimoInicio(finTeoricoUltima: Date, gapSeg: number): Date {
  return ceilAMinuto(new Date(finTeoricoUltima.getTime() + gapSeg * 1000));
}

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
 * Modelo proporcional por "vueltas" del circuito cerrado:
 *
 *   piezas_por_vuelta = perchas (200) * piezas_por_percha
 *   tiempo_por_vuelta (min) = largo (84 m) / velocidad (m/min)
 *   tiempo_total (seg) = (cantidad / piezas_por_vuelta) * tiempo_por_vuelta * 60
 *
 * Ej: 400 pzs, 2/percha (= 400 por vuelta), 0.5 m/min
 *   → (400/400) * (84/0.5) = 168 min = 10080 seg.
 *
 * Es fraccionado: una carga que no completa una vuelta entera cuenta su
 * fracción (200 pzs → media vuelta → 84 min). `velocidadMin` está en m/min.
 */
export function tiempoLavadoSeg(
  cantidadPiezas: number,
  piezasPorPercha: number,
  velocidadMin: number,
): number {
  if (piezasPorPercha <= 0) throw new Error("piezasPorPercha debe ser > 0");
  if (velocidadMin <= 0) throw new Error("velocidadMin debe ser > 0");
  if (cantidadPiezas < 0) throw new Error("cantidadPiezas debe ser >= 0");
  if (cantidadPiezas === 0) return 0;

  const piezasPorVuelta = PERCHAS_LAVADO * piezasPorPercha;
  const tiempoPorVueltaMin = LARGO_LAVADO_M / velocidadMin;
  return (cantidadPiezas / piezasPorVuelta) * tiempoPorVueltaMin * 60;
}

// =============================================================================
// Tiempo de cambio entre ítems consecutivos
// =============================================================================

export interface ItemParaCambio {
  tipo: ItemTipo;
  color: string;
  /** Mantenido por compat con código viejo; no se usa más en el cálculo del gap. */
  configPerchas?: string | null;
}

/**
 * Gap entre dos OTs consecutivas (`anterior` → `siguiente`):
 *  - Base: 15 min siempre (cambio de gancheras / preparación).
 *  - +30 min si `siguiente` es PINTURA, `anterior` también es PINTURA, y el
 *    color cambia. Total en ese caso: 45 min.
 *  - Si alguno es LAVADO, no aplica cambio de color (la comparación de color
 *    no tiene sentido en lavado): solo gap base = 15 min.
 */
export function tiempoCambioSeg(anterior: ItemParaCambio, siguiente: ItemParaCambio): number {
  if (anterior.tipo !== "PINTURA" || siguiente.tipo !== "PINTURA") {
    return GAP_BASE_SEG;
  }
  const cambiaColor = normalizarColor(anterior.color) !== normalizarColor(siguiente.color);
  return cambiaColor ? GAP_BASE_SEG + CAMBIO_COLOR_SEG : GAP_BASE_SEG;
}

function normalizarColor(c: string): string {
  return c.trim().toLowerCase();
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
// Desvío de tiempo real vs teórico
// =============================================================================

/// Umbral de desvío a partir del cual se exige justificación al finalizar (±20%).
export const UMBRAL_DESVIO = 0.2;

/**
 * Desvío relativo del tiempo real respecto del teórico: `(real - teo) / teo`.
 * Positivo = se excedió; negativo = terminó antes. Si el teórico es 0 devuelve 0.
 */
export function desvioRelativo(realSeg: number, teoricoSeg: number): number {
  if (teoricoSeg <= 0) return 0;
  return (realSeg - teoricoSeg) / teoricoSeg;
}

/**
 * true si el tiempo real se desvía del teórico más allá del umbral (±20% por
 * defecto), en cualquier dirección. En ese caso se pide justificación.
 */
export function requiereJustificacion(
  realSeg: number,
  teoricoSeg: number,
  umbral: number = UMBRAL_DESVIO,
): boolean {
  return Math.abs(desvioRelativo(realSeg, teoricoSeg)) > umbral;
}

// =============================================================================
// Re-encadenado al reordenar OTs (drag & drop)
// =============================================================================

export interface ItemReencadenable extends ItemParaCambio {
  /** Duración propia del ítem en segundos (no cambia al reordenar). */
  duracionSeg: number;
}

/**
 * Recalcula inicio/fin de una lista de OTs ya ordenada, anclando la primera en
 * `anclaInicio` y encadenando el resto con el gap aplicable entre cada par
 * (15 min base, +30 si cambia de color en PINTURA → PINTURA). A diferencia de
 * `planificar`, no recalcula la duración: la toma de `duracionSeg` (la OT ya
 * tiene su cantidad/artículo definidos, reordenar no los cambia).
 */
export function reencadenar(
  items: ItemReencadenable[],
  anclaInicio: Date,
): { inicio: Date; fin: Date }[] {
  const out: { inicio: Date; fin: Date }[] = [];
  let cursor = anclaInicio.getTime();
  let anterior: ItemReencadenable | null = null;
  for (const item of items) {
    const cambioSeg = anterior ? tiempoCambioSeg(anterior, item) : 0;
    const inicioMs = cursor + cambioSeg * 1000;
    const finMs = inicioMs + item.duracionSeg * 1000;
    out.push({ inicio: new Date(inicioMs), fin: new Date(finMs) });
    cursor = finMs;
    anterior = item;
  }
  return out;
}

/**
 * Resolutor de ventanas de jornada para el reencadenado consciente de turnos.
 * Se inyecta desde el server (envuelve `turnoQueContiene` / `proximoTurnoDesde`
 * de `@/lib/turnos`) para que `schedule.ts` no dependa de la DB ni de turnos.
 */
export interface VentanaResolver {
  /** Ventana de jornada que contiene `t`, o null si cae en fábrica cerrada. */
  ventanaDe(t: Date): { inicio: Date; fin: Date } | null;
  /** Inicio de la próxima ventana estrictamente posterior a `desde`, o null. */
  proximoInicio(desde: Date): Date | null;
}

/**
 * Dado un inicio candidato y la duración de una OT, devuelve el inicio real
 * teniendo en cuenta las ventanas de jornada:
 *  - Si el candidato cae en fábrica cerrada → próxima apertura.
 *  - Si entra en la ventana pero no termina antes del cierre → próxima apertura.
 *  - Si la OT es más larga que cualquier ventana → arranca al abrir y se acepta
 *    el overflow (mejor esfuerzo; no se puede hacer mejor sin partirla).
 */
function colocarEnJornada(
  inicioMs: number,
  duracionSeg: number,
  resolver: VentanaResolver,
): number {
  const durMs = duracionSeg * 1000;
  let t = inicioMs;
  // Cota de iteraciones: como mucho saltamos unas pocas ventanas hacia adelante.
  for (let i = 0; i < 16; i++) {
    const v = resolver.ventanaDe(new Date(t));
    if (!v) {
      // Fábrica cerrada en `t`: ir a la próxima apertura (sin gap de prep.).
      const px = resolver.proximoInicio(new Date(t));
      if (!px) return t; // no hay más ventanas: mejor esfuerzo.
      t = px.getTime();
      continue;
    }
    if (t + durMs <= v.fin.getTime()) return t; // entra completa.
    // No termina antes del cierre. Si ya estábamos al inicio de la ventana, la
    // OT es más larga que toda la ventana: aceptamos el overflow.
    if (t <= v.inicio.getTime()) return t;
    const px = resolver.proximoInicio(v.fin);
    if (!px) return v.inicio.getTime(); // sin próxima ventana: arranca al abrir.
    t = px.getTime();
  }
  return t;
}

/**
 * Igual que `reencadenar`, pero respeta las ventanas de jornada (turnos): cada
 * OT se encadena con su gap (15 min base, +30 si cambia color PINTURA→PINTURA),
 * pero si el inicio resultante cae con la fábrica cerrada, o la OT no termina
 * antes del cierre de la jornada, se empuja al inicio de la próxima ventana
 * (sin gap de preparación, igual que una continuación recién creada).
 *
 * Es lo que usa el endpoint de reordenar para que mover una OT recalcule los
 * horarios de toda la cola respetando el cierre nocturno.
 */
export function reencadenarEnJornada(
  items: ItemReencadenable[],
  anclaInicio: Date,
  resolver: VentanaResolver,
): { inicio: Date; fin: Date }[] {
  const out: { inicio: Date; fin: Date }[] = [];
  let cursor = anclaInicio.getTime();
  let anterior: ItemReencadenable | null = null;
  for (const item of items) {
    const cambioSeg = anterior ? tiempoCambioSeg(anterior, item) : 0;
    const inicioMs = colocarEnJornada(cursor + cambioSeg * 1000, item.duracionSeg, resolver);
    const finMs = inicioMs + item.duracionSeg * 1000;
    out.push({ inicio: new Date(inicioMs), fin: new Date(finMs) });
    cursor = finMs;
    anterior = item;
  }
  return out;
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
