import { describe, it, expect } from "vitest";
import {
  GAP_BASE_SEG,
  CAMBIO_COLOR_SEG,
  LARGO_LAVADO_M,
  PERCHAS_LAVADO,
  ceilAMinuto,
  minimoInicio,
  tiempoPinturaSeg,
  tiempoLavadoSeg,
  tiempoCambioSeg,
  duracionItem,
  planificar,
  proponerOrdenOptimo,
  reencadenar,
  desvioRelativo,
  requiereJustificacion,
  UMBRAL_DESVIO,
  type ItemParaCambio,
  type ItemPlan,
  type ItemReencadenable,
} from "@/lib/schedule";

describe("constantes", () => {
  it("tienen los valores de la spec", () => {
    expect(GAP_BASE_SEG).toBe(15 * 60);
    expect(CAMBIO_COLOR_SEG).toBe(30 * 60);
    expect(LARGO_LAVADO_M).toBe(84);
    expect(PERCHAS_LAVADO).toBe(200);
  });
});

describe("tiempoPinturaSeg", () => {
  it("tiempo = cantidad / piezas_por_hora * 3600", () => {
    expect(tiempoPinturaSeg(3600, 3600)).toBe(3600);
    expect(tiempoPinturaSeg(7200, 3600)).toBe(7200);
    expect(tiempoPinturaSeg(0, 100)).toBe(0);
  });
  it("rechaza piezasPorHora <= 0 y cantidad < 0", () => {
    expect(() => tiempoPinturaSeg(100, 0)).toThrow();
    expect(() => tiempoPinturaSeg(-1, 100)).toThrow();
  });
});

describe("tiempoLavadoSeg", () => {
  it("modelo por vueltas: 400 pzs, 2/percha, 0.5 m/min = 10080 s", () => {
    expect(tiempoLavadoSeg(400, 2, 0.5)).toBe(10080);
  });
  it("es fraccionado (media vuelta cuenta su fracción)", () => {
    expect(tiempoLavadoSeg(200, 2, 0.5)).toBe(5040);
  });
  it("0 piezas = 0 s", () => {
    expect(tiempoLavadoSeg(0, 2, 0.5)).toBe(0);
  });
  it("rechaza parámetros inválidos", () => {
    expect(() => tiempoLavadoSeg(100, 0, 0.5)).toThrow();
    expect(() => tiempoLavadoSeg(100, 2, 0)).toThrow();
  });
});

describe("tiempoCambioSeg", () => {
  const pintura = (color: string): ItemParaCambio => ({ tipo: "PINTURA", color });
  const lavado = (): ItemParaCambio => ({ tipo: "LAVADO", color: "" });

  it("PINTURA→PINTURA mismo color = gap base", () => {
    expect(tiempoCambioSeg(pintura("Rojo"), pintura("Rojo"))).toBe(GAP_BASE_SEG);
  });
  it("PINTURA→PINTURA cambio de color = base + 30 min", () => {
    expect(tiempoCambioSeg(pintura("Rojo"), pintura("Azul"))).toBe(GAP_BASE_SEG + CAMBIO_COLOR_SEG);
  });
  it("compara color case-insensitive y trim", () => {
    expect(tiempoCambioSeg(pintura("Rojo"), pintura("  rojo "))).toBe(GAP_BASE_SEG);
  });
  it("si alguno es LAVADO no hay cambio de color (solo base)", () => {
    expect(tiempoCambioSeg(lavado(), pintura("Azul"))).toBe(GAP_BASE_SEG);
    expect(tiempoCambioSeg(pintura("Azul"), lavado())).toBe(GAP_BASE_SEG);
  });
});

describe("reencadenar", () => {
  const t0 = new Date("2026-06-10T06:00:00.000Z");
  const HORA = 3600;

  it("ancla la primera OT en anclaInicio y encadena con gap base", () => {
    const items: ItemReencadenable[] = [
      { tipo: "PINTURA", color: "Rojo", duracionSeg: HORA },
      { tipo: "PINTURA", color: "Rojo", duracionSeg: HORA },
    ];
    const r = reencadenar(items, t0);
    expect(r[0].inicio.getTime()).toBe(t0.getTime());
    expect(r[0].fin.getTime()).toBe(t0.getTime() + HORA * 1000);
    // segunda arranca tras 15 min de gap (mismo color).
    expect(r[1].inicio.getTime()).toBe(r[0].fin.getTime() + GAP_BASE_SEG * 1000);
    expect(r[1].fin.getTime()).toBe(r[1].inicio.getTime() + HORA * 1000);
  });

  it("suma 30 min extra cuando cambia de color en PINTURA→PINTURA", () => {
    const items: ItemReencadenable[] = [
      { tipo: "PINTURA", color: "Rojo", duracionSeg: HORA },
      { tipo: "PINTURA", color: "Azul", duracionSeg: HORA },
    ];
    const r = reencadenar(items, t0);
    expect(r[1].inicio.getTime()).toBe(
      r[0].fin.getTime() + (GAP_BASE_SEG + CAMBIO_COLOR_SEG) * 1000,
    );
  });

  it("lista vacía devuelve []", () => {
    expect(reencadenar([], t0)).toEqual([]);
  });
});

describe("desvío de tiempo", () => {
  it("desvioRelativo = (real - teo) / teo", () => {
    expect(desvioRelativo(120, 100)).toBeCloseTo(0.2);
    expect(desvioRelativo(80, 100)).toBeCloseTo(-0.2);
    expect(desvioRelativo(100, 0)).toBe(0);
  });
  it("requiereJustificacion solo si supera el umbral (estricto)", () => {
    expect(UMBRAL_DESVIO).toBe(0.2);
    expect(requiereJustificacion(120, 100)).toBe(false); // exactamente 20% no excede
    expect(requiereJustificacion(121, 100)).toBe(true); // 21%
    expect(requiereJustificacion(79, 100)).toBe(true); // -21%
    expect(requiereJustificacion(100, 100)).toBe(false);
  });
});

describe("duracionItem", () => {
  it("PINTURA usa piezasPorHora", () => {
    const d = duracionItem({ tipo: "PINTURA", cantidadPiezas: 3600, piezasPorHora: 3600, color: "Rojo" });
    expect(d.pinturaSeg).toBe(3600);
    expect(d.lavadoSeg).toBe(0);
    expect(d.totalSeg).toBe(3600);
  });
  it("LAVADO usa piezasPorPercha y velocidad", () => {
    const d = duracionItem({
      tipo: "LAVADO",
      cantidadPiezas: 400,
      piezasPorHora: 0,
      color: "",
      piezasPorPercha: 2,
      velocidadLavado: 0.5,
    });
    expect(d.lavadoSeg).toBe(10080);
    expect(d.totalSeg).toBe(10080);
  });
  it("LAVADO sin ppp/velocidad lanza error", () => {
    expect(() =>
      duracionItem({ tipo: "LAVADO", cantidadPiezas: 10, piezasPorHora: 0, color: "" }),
    ).toThrow();
  });
});

describe("planificar", () => {
  const inicio = new Date(2026, 5, 9, 6, 0, 0, 0);
  const items: ItemPlan[] = [
    { index: 0, tipo: "PINTURA", cantidadPiezas: 3600, piezasPorHora: 3600, color: "Rojo" },
    { index: 1, tipo: "PINTURA", cantidadPiezas: 3600, piezasPorHora: 3600, color: "Rojo" },
  ];

  it("encadena cambio + duración de cada ítem", () => {
    const plan = planificar(items, inicio);
    // Primero: sin cambio (cambioSeg 0), dura 1 h.
    expect(plan[0].cambioSeg).toBe(0);
    expect(plan[0].inicio.getTime()).toBe(inicio.getTime());
    expect(plan[0].fin.getTime()).toBe(inicio.getTime() + 3600_000);
    // Segundo: gap base (mismo color) + 1 h.
    expect(plan[1].cambioSeg).toBe(GAP_BASE_SEG);
    expect(plan[1].inicio.getTime()).toBe(plan[0].fin.getTime() + GAP_BASE_SEG * 1000);
    expect(plan[1].fin.getTime()).toBe(plan[1].inicio.getTime() + 3600_000);
  });

  it("aplica +30 min cuando el segundo cambia de color", () => {
    const conColor: ItemPlan[] = [items[0], { ...items[1], color: "Azul" }];
    const plan = planificar(conColor, inicio);
    expect(plan[1].cambioSeg).toBe(GAP_BASE_SEG + CAMBIO_COLOR_SEG);
  });
});

describe("proponerOrdenOptimo", () => {
  it("pone los LAVADO primero y después los PINTURA", () => {
    const items: ItemPlan[] = [
      { index: 0, tipo: "PINTURA", cantidadPiezas: 100, piezasPorHora: 100, color: "Rojo" },
      { index: 1, tipo: "LAVADO", cantidadPiezas: 100, piezasPorHora: 0, color: "", piezasPorPercha: 2, velocidadLavado: 1 },
      { index: 2, tipo: "PINTURA", cantidadPiezas: 100, piezasPorHora: 100, color: "Azul" },
    ];
    const orden = proponerOrdenOptimo(items);
    expect(orden[0]).toBe(1); // el lavado primero
    expect(orden.slice(1).sort()).toEqual([0, 2]); // después las dos pinturas
  });
});

describe("ceilAMinuto / minimoInicio", () => {
  it("ceilAMinuto redondea hacia arriba al minuto entero", () => {
    const d = new Date(2026, 5, 9, 14, 23, 45, 0);
    const r = ceilAMinuto(d);
    expect(r.getSeconds()).toBe(0);
    expect(r.getMinutes()).toBe(24);
  });
  it("ceilAMinuto deja intacto un tiempo ya en minuto exacto", () => {
    const d = new Date(2026, 5, 9, 14, 23, 0, 0);
    expect(ceilAMinuto(d).getTime()).toBe(d.getTime());
  });
  it("minimoInicio = fin + gap redondeado al minuto", () => {
    const fin = new Date(2026, 5, 9, 14, 0, 0, 0);
    const r = minimoInicio(fin, GAP_BASE_SEG);
    expect(r.getTime()).toBe(new Date(2026, 5, 9, 14, 15, 0, 0).getTime());
  });
});
