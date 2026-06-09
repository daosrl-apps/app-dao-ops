/**
 * Lógica de turnos de trabajo.
 *
 * Un Turno define nombre + hora de inicio (HH:MM local) + duración en minutos.
 * Por defecto hay 3 turnos que cubren las 24 h:
 *   Mañana 06:00–14:00, Tarde 14:00–22:00, Noche 22:00–06:00 (cruza medianoche).
 *
 * Los turnos contiguos (donde el fin de uno coincide con el inicio del
 * siguiente) se fusionan en una sola "ventana de jornada": la fábrica trabaja
 * sin pausa de punta a punta. Con los 3 turnos por defecto la jornada es
 * continua (24 h) y nunca corta.
 *
 * El inicio del primer turno habilitado = apertura de fábrica; el fin del
 * último = cierre. Las OTs deben caber dentro de una VENTANA (no de un turno
 * individual). Si una OT no entra, se ofrece partirla y continuarla en el
 * inicio de la próxima ventana.
 *
 * "Extender turno": reconfigura los turnos a Mañana 06:00–18:00 / Tarde
 * 18:00–06:00 (dos turnos de 12 h, jornada 24 h, la fábrica no cierra ese día)
 * y deshabilita Noche. Si se activó "solo una vez", al cambiar el día calendario
 * se restaura la configuración previa (revert perezoso en `obtenerTurnos`).
 */
import { prisma } from "@/lib/db";

export interface TurnoSlot {
  /// Hora local de inicio de la ventana (puede abarcar varios turnos fusionados).
  inicio: Date;
  /// Hora local de fin de la ventana.
  fin: Date;
}

export interface TurnoConfig {
  id: string;
  orden: number;
  nombre: string;
  horaInicio: number;
  minutoInicio: number;
  duracionMin: number;
  habilitado: boolean;
}

/// Turnos por defecto cuando la tabla está vacía (primer arranque / seed).
export const TURNOS_DEFAULT: Omit<TurnoConfig, "id">[] = [
  { orden: 1, nombre: "Mañana", horaInicio: 6, minutoInicio: 0, duracionMin: 480, habilitado: true },
  { orden: 2, nombre: "Tarde", horaInicio: 14, minutoInicio: 0, duracionMin: 480, habilitado: true },
  { orden: 3, nombre: "Noche", horaInicio: 22, minutoInicio: 0, duracionMin: 480, habilitado: true },
];

/// Configuración de turnos cuando "Extender turno" está activo.
/// Mañana 06:00–18:00 (12 h), Tarde 18:00–06:00 (12 h), Noche deshabilitado.
/// Jornada de 24 h continua: la fábrica no cierra ese día.
export const TURNOS_EXTENDIDOS: Omit<TurnoConfig, "id">[] = [
  { orden: 1, nombre: "Mañana", horaInicio: 6, minutoInicio: 0, duracionMin: 720, habilitado: true },
  { orden: 2, nombre: "Tarde", horaInicio: 18, minutoInicio: 0, duracionMin: 720, habilitado: true },
  { orden: 3, nombre: "Noche", horaInicio: 22, minutoInicio: 0, duracionMin: 480, habilitado: false },
];

/**
 * Lee la config singleton de la planta (la crea si no existe).
 */
export async function obtenerConfiguracionPlanta() {
  return prisma.configuracionPlanta.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });
}

/**
 * Revert perezoso del modo extendido: si está activo con "solo una vez" y la
 * fecha de activación es de un día calendario anterior a hoy, restaura la
 * configuración previa y limpia el flag. Devuelve true si revirtió.
 */
async function revertirExtensionSiCorresponde(): Promise<boolean> {
  const cfg = await obtenerConfiguracionPlanta();
  if (!cfg.extenderActivo || !cfg.extenderSoloUnaVez || !cfg.extenderFecha) {
    return false;
  }
  if (mismoDiaLocal(cfg.extenderFecha, new Date())) {
    return false; // todavía es el mismo día: sigue extendido.
  }
  await restaurarConfigPrevia(cfg.configPrevia);
  return true;
}

/**
 * Lee los turnos habilitados de la DB, ordenados por `orden` asc.
 * Antes de leer, aplica el revert perezoso del modo extendido.
 * Si la tabla está vacía (primer arranque), devuelve los turnos por defecto.
 */
export async function obtenerTurnos(): Promise<TurnoConfig[]> {
  await revertirExtensionSiCorresponde();
  const turnos = await prisma.turno.findMany({
    where: { habilitado: true },
    orderBy: { orden: "asc" },
  });
  if (turnos.length === 0) {
    return TURNOS_DEFAULT.map((t, i) => ({ id: `default-${i + 1}`, ...t }));
  }
  return turnos;
}

/**
 * Lee TODOS los turnos (habilitados o no) para la pantalla de configuración.
 * Aplica el revert perezoso antes de leer.
 */
export async function obtenerTurnosTodos(): Promise<TurnoConfig[]> {
  await revertirExtensionSiCorresponde();
  const turnos = await prisma.turno.findMany({ orderBy: { orden: "asc" } });
  if (turnos.length === 0) {
    return TURNOS_DEFAULT.map((t, i) => ({ id: `default-${i + 1}`, ...t }));
  }
  return turnos;
}

// =============================================================================
// Extender turno
// =============================================================================

/**
 * Activa el modo extendido: snapshot de la config actual + reescritura de los
 * turnos a la config extendida. `soloUnaVez` controla el revert automático al
 * cambiar el día calendario.
 */
export async function aplicarExtension(soloUnaVez: boolean): Promise<void> {
  const actuales = await prisma.turno.findMany({ orderBy: { orden: "asc" } });
  const snapshot = (actuales.length > 0
    ? actuales.map((t) => ({
        orden: t.orden,
        nombre: t.nombre,
        horaInicio: t.horaInicio,
        minutoInicio: t.minutoInicio,
        duracionMin: t.duracionMin,
        habilitado: t.habilitado,
      }))
    : TURNOS_DEFAULT);

  await prisma.$transaction(async (tx) => {
    await tx.turno.deleteMany({});
    for (const t of TURNOS_EXTENDIDOS) {
      await tx.turno.create({ data: t });
    }
    await tx.configuracionPlanta.upsert({
      where: { id: "default" },
      update: {
        extenderActivo: true,
        extenderSoloUnaVez: soloUnaVez,
        extenderFecha: new Date(),
        configPrevia: snapshot as unknown as object,
      },
      create: {
        id: "default",
        extenderActivo: true,
        extenderSoloUnaVez: soloUnaVez,
        extenderFecha: new Date(),
        configPrevia: snapshot as unknown as object,
      },
    });
  });
}

/**
 * Revierte el modo extendido manualmente, restaurando la config previa.
 */
export async function revertirExtension(): Promise<void> {
  const cfg = await obtenerConfiguracionPlanta();
  await restaurarConfigPrevia(cfg.configPrevia);
}

async function restaurarConfigPrevia(configPrevia: unknown): Promise<void> {
  const previos = Array.isArray(configPrevia)
    ? (configPrevia as Omit<TurnoConfig, "id">[])
    : TURNOS_DEFAULT;
  await prisma.$transaction(async (tx) => {
    await tx.turno.deleteMany({});
    for (const t of previos) {
      await tx.turno.create({
        data: {
          orden: t.orden,
          nombre: t.nombre,
          horaInicio: t.horaInicio,
          minutoInicio: t.minutoInicio,
          duracionMin: t.duracionMin,
          habilitado: t.habilitado,
        },
      });
    }
    await tx.configuracionPlanta.upsert({
      where: { id: "default" },
      update: { extenderActivo: false, extenderSoloUnaVez: false, extenderFecha: null, configPrevia: undefined },
      create: { id: "default" },
    });
  });
}

function mismoDiaLocal(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// =============================================================================
// Validación de configuración (no-solape, total ≤ 24 h)
// =============================================================================

export interface TurnoValidable {
  orden: number;
  horaInicio: number;
  minutoInicio: number;
  duracionMin: number;
  habilitado: boolean;
}

/**
 * Valida que los turnos habilitados no se solapen entre sí y que la suma de
 * duraciones no exceda 24 h. Los turnos pueden cruzar medianoche; se proyectan
 * sobre una línea de tiempo circular de 24 h (1440 min) para detectar solapes.
 * Devuelve un mensaje de error o null si todo OK.
 */
export function validarTurnos(turnos: TurnoValidable[]): string | null {
  const habilitados = turnos.filter((t) => t.habilitado);
  if (habilitados.length === 0) return null;

  const totalMin = habilitados.reduce((acc, t) => acc + t.duracionMin, 0);
  if (totalMin > 24 * 60) {
    return "La suma de las duraciones de los turnos no puede superar las 24 horas.";
  }

  // Cada turno → intervalo [inicio, inicio+dur) en minutos. Para detectar
  // solapes con turnos que cruzan medianoche, comparamos en una ventana de
  // 48 h replicando cada intervalo +1440.
  const intervalos = habilitados.map((t) => {
    const inicio = t.horaInicio * 60 + t.minutoInicio;
    return { inicio, fin: inicio + t.duracionMin };
  });

  for (let i = 0; i < intervalos.length; i++) {
    for (let j = i + 1; j < intervalos.length; j++) {
      if (seSolapanCirculares(intervalos[i], intervalos[j])) {
        return "Hay turnos que se solapan. Revisá los horarios de inicio y las duraciones.";
      }
    }
  }
  return null;
}

function seSolapanCirculares(
  a: { inicio: number; fin: number },
  b: { inicio: number; fin: number },
): boolean {
  // Replicamos cada intervalo en [0,1440) y [1440,2880) para cubrir el cruce de
  // medianoche, y chequeamos solape de cualquier par de réplicas.
  const repsA = [a, { inicio: a.inicio + 1440, fin: a.fin + 1440 }];
  const repsB = [b, { inicio: b.inicio + 1440, fin: b.fin + 1440 }];
  for (const ra of repsA) {
    for (const rb of repsB) {
      if (ra.inicio < rb.fin && rb.inicio < ra.fin) return true;
    }
  }
  return false;
}

/**
 * Construye los slots crudos de cada turno individual para un día dado.
 * No fusiona contiguos. Para los chequeos de jornada usar `ventanasJornada`.
 */
function slotsCrudosParaDia(turnos: TurnoConfig[], dia: Date): TurnoSlot[] {
  return turnos.map((t) => {
    const inicio = new Date(
      dia.getFullYear(),
      dia.getMonth(),
      dia.getDate(),
      t.horaInicio,
      t.minutoInicio,
      0,
      0,
    );
    const fin = new Date(inicio.getTime() + t.duracionMin * 60_000);
    return { inicio, fin };
  });
}

/**
 * Devuelve las ventanas de jornada (turnos contiguos fusionados) que tocan
 * el día `dia`. Considera turnos del día anterior y siguiente porque pueden
 * encadenarse cruzando medianoche (turno nocturno, jornada 24 h, etc.).
 *
 * Las ventanas devueltas pueden extenderse fuera de `dia` si la cadena de
 * turnos contiguos lo justifica.
 */
export function ventanasJornada(turnos: TurnoConfig[], dia: Date): TurnoSlot[] {
  const todos: TurnoSlot[] = [];
  for (let delta = -1; delta <= 1; delta++) {
    const d = new Date(dia);
    d.setDate(d.getDate() + delta);
    todos.push(...slotsCrudosParaDia(turnos, d));
  }
  todos.sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const merged: TurnoSlot[] = [];
  for (const s of todos) {
    const last = merged[merged.length - 1];
    if (last && last.fin.getTime() >= s.inicio.getTime()) {
      if (s.fin.getTime() > last.fin.getTime()) last.fin = s.fin;
    } else {
      merged.push({ inicio: s.inicio, fin: s.fin });
    }
  }
  return merged;
}

/**
 * Devuelve la ventana de jornada que contiene a `inicio` (si hay).
 * Una ventana es una secuencia de turnos contiguos sin gap entre ellos.
 */
export function turnoQueContiene(
  turnos: TurnoConfig[],
  inicio: Date,
): TurnoSlot | null {
  for (const v of ventanasJornada(turnos, inicio)) {
    if (inicio >= v.inicio && inicio < v.fin) return v;
  }
  return null;
}

/**
 * Calcula si una OT que arranca en `inicio` con `duracionSeg` cabe dentro de
 * la ventana de jornada vigente (turnos contiguos fusionados).
 *
 * Devuelve:
 *  - `entra: true`     → la OT cabe completa dentro de la ventana.
 *  - `entra: false`    → la OT excede la ventana. `fitSeg` es cuánto entra
 *                        antes del fin de la jornada; `restoSeg` es lo que
 *                        queda fuera y debe ir a una continuación.
 *                        `proximoInicio` es el inicio de la próxima ventana
 *                        de jornada disponible.
 */
export function evaluarOrdenContraTurno(
  turnos: TurnoConfig[],
  inicio: Date,
  duracionSeg: number,
):
  | { entra: true }
  | {
      entra: false;
      fitSeg: number;
      restoSeg: number;
      finTurno: Date;
      proximoInicio: Date;
    } {
  const slot = turnoQueContiene(turnos, inicio);
  if (!slot) {
    const proximo = proximoTurnoDesde(turnos, inicio);
    return {
      entra: false,
      fitSeg: 0,
      restoSeg: duracionSeg,
      finTurno: inicio,
      proximoInicio: proximo ?? inicio,
    };
  }

  const finOTms = inicio.getTime() + duracionSeg * 1000;
  if (finOTms <= slot.fin.getTime()) {
    return { entra: true };
  }

  const fitSeg = Math.max(0, Math.floor((slot.fin.getTime() - inicio.getTime()) / 1000));
  const restoSeg = duracionSeg - fitSeg;
  const proximo = proximoTurnoDesde(turnos, slot.fin);

  return {
    entra: false,
    fitSeg,
    restoSeg,
    finTurno: slot.fin,
    proximoInicio: proximo ?? slot.fin,
  };
}

/**
 * Devuelve el inicio de la próxima ventana de jornada estrictamente posterior
 * a `desde`. Busca hasta 14 días por adelantado por las dudas; null si no hay.
 */
export function proximoTurnoDesde(
  turnos: TurnoConfig[],
  desde: Date,
): Date | null {
  for (let delta = 0; delta < 14; delta++) {
    const d = new Date(desde);
    d.setDate(d.getDate() + delta);
    for (const v of ventanasJornada(turnos, d)) {
      if (v.inicio > desde) return v.inicio;
    }
  }
  return null;
}
