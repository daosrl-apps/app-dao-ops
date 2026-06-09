import { describe, it, expect } from "vitest";
import {
  validarTurnos,
  ventanasJornada,
  turnoQueContiene,
  evaluarOrdenContraTurno,
  proximoTurnoDesde,
  TURNOS_DEFAULT,
  TURNOS_EXTENDIDOS,
  type TurnoConfig,
} from "@/lib/turnos";

function turno(
  orden: number,
  nombre: string,
  horaInicio: number,
  duracionMin: number,
  habilitado = true,
): TurnoConfig {
  return { id: String(orden), orden, nombre, horaInicio, minutoInicio: 0, duracionMin, habilitado };
}

// Configs usadas en varios tests.
const MANANA_TARDE_CONTIGUO: TurnoConfig[] = [
  turno(1, "Mañana", 6, 480), // 06–14
  turno(2, "Tarde", 14, 600), // 14–00 (cruza medianoche)
];
const MANANA_TARDE_CON_HUECO: TurnoConfig[] = [
  turno(1, "Mañana", 6, 480), // 06–14
  turno(2, "Tarde", 15, 420), // 15–22  (hueco 14–15)
];
const DEFAULT_24H: TurnoConfig[] = [
  turno(1, "Mañana", 6, 480), // 06–14
  turno(2, "Tarde", 14, 480), // 14–22
  turno(3, "Noche", 22, 480), // 22–06
];

const dia = new Date(2026, 5, 9); // 09/06/2026, hora local

describe("validarTurnos", () => {
  it("acepta los 3 turnos por defecto (sin solape, 24 h)", () => {
    expect(validarTurnos(DEFAULT_24H)).toBeNull();
  });
  it("rechaza turnos solapados", () => {
    const solapados = [turno(1, "A", 6, 600), turno(2, "B", 14, 480)]; // 06–16 y 14–22
    expect(validarTurnos(solapados)).toMatch(/solap/i);
  });
  it("rechaza si la suma supera 24 h", () => {
    const exceso = [turno(1, "A", 0, 800), turno(2, "B", 14, 800)];
    expect(validarTurnos(exceso)).toMatch(/24 horas/i);
  });
  it("ignora los turnos deshabilitados", () => {
    const conDeshab = [turno(1, "A", 6, 480), turno(2, "B", 6, 480, false)];
    expect(validarTurnos(conDeshab)).toBeNull();
  });
});

describe("ventanasJornada — fusión de turnos contiguos", () => {
  it("fusiona Mañana+Tarde contiguos en una sola ventana 06:00→00:00", () => {
    const v = ventanasJornada(MANANA_TARDE_CONTIGUO, dia);
    const hoy = v.find((w) => w.inicio.getDate() === 9 && w.inicio.getHours() === 6);
    expect(hoy).toBeDefined();
    expect(hoy!.fin.getDate()).toBe(10);
    expect(hoy!.fin.getHours()).toBe(0); // medianoche del día siguiente
  });
  it("NO fusiona cuando hay un hueco entre turnos", () => {
    const v = ventanasJornada(MANANA_TARDE_CON_HUECO, dia);
    const manana = v.find((w) => w.inicio.getDate() === 9 && w.inicio.getHours() === 6);
    expect(manana).toBeDefined();
    expect(manana!.fin.getHours()).toBe(14); // la ventana de Mañana corta a las 14
  });
});

describe("turnoQueContiene", () => {
  it("encuentra la ventana fusionada para una hora de la tarde/noche", () => {
    const slot = turnoQueContiene(MANANA_TARDE_CONTIGUO, new Date(2026, 5, 9, 23, 0));
    expect(slot).not.toBeNull();
    expect(slot!.inicio.getHours()).toBe(6);
  });
  it("devuelve null en el hueco entre jornadas (madrugada)", () => {
    // Con Mañana+Tarde 06–00, entre 00:00 y 06:00 la fábrica está cerrada.
    const slot = turnoQueContiene(MANANA_TARDE_CONTIGUO, new Date(2026, 5, 9, 3, 0));
    expect(slot).toBeNull();
  });
});

describe("evaluarOrdenContraTurno", () => {
  it("una OT que cruza el borde interno Mañana→Tarde (contiguos) NO se parte", () => {
    // 10:00 + 6 h = 16:00; cruza las 14:00 pero está todo dentro de la jornada.
    const ev = evaluarOrdenContraTurno(MANANA_TARDE_CONTIGUO, new Date(2026, 5, 9, 10, 0), 6 * 3600);
    expect(ev.entra).toBe(true);
  });

  it("una OT que excede el último turno se parte en el cierre (medianoche)", () => {
    // 23:00 + 6 h excede las 00:00.
    const ev = evaluarOrdenContraTurno(MANANA_TARDE_CONTIGUO, new Date(2026, 5, 9, 23, 0), 6 * 3600);
    expect(ev.entra).toBe(false);
    if (ev.entra === false) {
      expect(ev.finTurno.getDate()).toBe(10);
      expect(ev.finTurno.getHours()).toBe(0); // se parte a medianoche
      // continúa en la apertura de la próxima jornada (06:00).
      expect(ev.proximoInicio.getHours()).toBe(6);
      expect(ev.restoSeg).toBeGreaterThan(0);
    }
  });

  it("con un hueco entre turnos, SÍ se parte en el borde (fin del primer bloque)", () => {
    // Mañana 06–14, Tarde 15–22. 10:00 + 6 h = 16:00 cae en el hueco/Tarde.
    const ev = evaluarOrdenContraTurno(MANANA_TARDE_CON_HUECO, new Date(2026, 5, 9, 10, 0), 6 * 3600);
    expect(ev.entra).toBe(false);
    if (ev.entra === false) {
      expect(ev.finTurno.getHours()).toBe(14); // corta al cierre de Mañana
      expect(ev.proximoInicio.getHours()).toBe(15); // sigue en la apertura de Tarde
    }
  });

  it("con jornada de 24 h (3 turnos) una OT nocturna larga NO se parte", () => {
    const ev = evaluarOrdenContraTurno(DEFAULT_24H, new Date(2026, 5, 9, 23, 0), 10 * 3600);
    expect(ev.entra).toBe(true);
  });
});

describe("proximoTurnoDesde", () => {
  it("devuelve la apertura de la próxima jornada", () => {
    const prox = proximoTurnoDesde(MANANA_TARDE_CONTIGUO, new Date(2026, 5, 9, 2, 0));
    expect(prox).not.toBeNull();
    expect(prox!.getHours()).toBe(6);
    expect(prox!.getDate()).toBe(9);
  });
});

describe("configuraciones por defecto", () => {
  it("TURNOS_DEFAULT cubre 24 h en 3 turnos contiguos", () => {
    expect(TURNOS_DEFAULT).toHaveLength(3);
    expect(TURNOS_DEFAULT.every((t) => t.habilitado)).toBe(true);
    expect(TURNOS_DEFAULT.reduce((acc, t) => acc + t.duracionMin, 0)).toBe(24 * 60);
  });
  it("TURNOS_EXTENDIDOS = Mañana 06–18 / Tarde 18–06 (12 h c/u), Noche off", () => {
    const m = TURNOS_EXTENDIDOS.find((t) => t.nombre === "Mañana")!;
    const t = TURNOS_EXTENDIDOS.find((t) => t.nombre === "Tarde")!;
    const n = TURNOS_EXTENDIDOS.find((t) => t.nombre === "Noche")!;
    expect([m.horaInicio, m.duracionMin]).toEqual([6, 720]);
    expect([t.horaInicio, t.duracionMin]).toEqual([18, 720]);
    expect(n.habilitado).toBe(false);
  });
});
