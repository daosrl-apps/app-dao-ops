/**
 * Lógica de turnos de trabajo.
 *
 * Un Turno define hora de inicio (HH:MM local) + duración en minutos. Hay
 * hasta N turnos (en la práctica 1 o 2). Las OTs deben caber dentro de un
 * turno; si una no entra, se ofrece partirla y continuarla en el primer
 * turno disponible del día siguiente.
 */
import { prisma } from "@/lib/db";

export interface TurnoSlot {
  /// Identificador del turno (orden 1, 2, …).
  orden: number;
  /// Hora del día (local) de inicio del slot.
  inicio: Date;
  /// Hora del día (local) de fin del slot (inicio + duración).
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
 * Construye los slots concretos (Date inicio/fin) para un día dado.
 * El día se interpreta en hora local del server.
 */
export function slotsParaDia(turnos: TurnoConfig[], dia: Date): TurnoSlot[] {
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
    return { orden: t.orden, inicio, fin };
  });
}

/**
 * Devuelve el slot de turno que contiene a `inicio` (si hay), buscando hasta
 * 2 días hacia adelante y atrás (para cubrir turnos que cruzan medianoche
 * o cargas previas al primer turno del día).
 */
export function turnoQueContiene(
  turnos: TurnoConfig[],
  inicio: Date,
): TurnoSlot | null {
  for (let delta = -1; delta <= 1; delta++) {
    const d = new Date(inicio);
    d.setDate(d.getDate() + delta);
    for (const s of slotsParaDia(turnos, d)) {
      if (inicio >= s.inicio && inicio < s.fin) return s;
    }
  }
  return null;
}

/**
 * Calcula cuánto durará una OT que arranca en `inicio` con `duracionSeg` de
 * trabajo, considerando si entra completa en el turno o no.
 *
 * Devuelve:
 *  - `entra: true`     → la OT cabe completa.
 *  - `entra: false`    → la OT excede el turno. `fitSeg` es cuánto entra en el
 *                        turno actual (antes del fin del turno); `restoSeg` es
 *                        lo que queda fuera y va a una continuación.
 *                        `proximoInicio` es la hora local del primer turno
 *                        disponible del día siguiente para la continuación.
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
    // Arranca fuera de cualquier turno. Reportamos "no entra" con resto = todo,
    // sin tiempo de fit y próximo inicio = próximo turno.
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
 * Devuelve el inicio del próximo turno disponible estrictamente posterior a
 * `desde`. Busca hasta 14 días por adelantado por las dudas; null si no hay.
 */
export function proximoTurnoDesde(
  turnos: TurnoConfig[],
  desde: Date,
): Date | null {
  for (let delta = 0; delta < 14; delta++) {
    const d = new Date(desde);
    d.setDate(d.getDate() + delta);
    for (const s of slotsParaDia(turnos, d)) {
      if (s.inicio > desde) return s.inicio;
    }
  }
  return null;
}
