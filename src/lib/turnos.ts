/**
 * Lógica de turnos de trabajo.
 *
 * Un Turno define hora de inicio (HH:MM local) + duración en minutos. Una
 * jornada laboral puede estar compuesta por 1 a 4 turnos. Los turnos
 * contiguos (donde el fin de uno coincide con el inicio del siguiente) se
 * fusionan en una sola "ventana de jornada": la fábrica trabaja sin pausa
 * de punta a punta. Si la suma cubre las 24 h, la jornada es continua y
 * nunca corta.
 *
 * Las OTs deben caber dentro de una VENTANA (no de un turno individual).
 * Si una OT no entra, se ofrece partirla y continuarla en el inicio de la
 * próxima ventana.
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
  horaInicio: number;
  minutoInicio: number;
  duracionMin: number;
  habilitado: boolean;
}

/**
 * Lee los turnos habilitados de la DB, ordenados por `orden` asc.
 * Si la tabla está vacía (primer arranque), devuelve un turno default 6-14.
 */
export async function obtenerTurnos(): Promise<TurnoConfig[]> {
  const turnos = await prisma.turno.findMany({
    where: { habilitado: true },
    orderBy: { orden: "asc" },
  });
  if (turnos.length === 0) {
    return [
      {
        id: "default",
        orden: 1,
        horaInicio: 6,
        minutoInicio: 0,
        duracionMin: 480,
        habilitado: true,
      },
    ];
  }
  return turnos;
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
