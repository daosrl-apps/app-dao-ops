import { describe, it, expect } from "vitest";
import { resolverVentanas, ventanaUltimaSemana } from "@/lib/metricas";

describe("resolverVentanas", () => {
  it("la ventana anterior es del mismo largo, justo antes de la actual", () => {
    const actual = { inicio: new Date(2026, 5, 1, 0, 0), fin: new Date(2026, 5, 8, 0, 0) }; // 7 días
    const { anterior } = resolverVentanas(actual);
    expect(anterior.fin.getTime()).toBe(actual.inicio.getTime());
    const largoActual = actual.fin.getTime() - actual.inicio.getTime();
    const largoAnterior = anterior.fin.getTime() - anterior.inicio.getTime();
    expect(largoAnterior).toBe(largoActual);
    expect(anterior.inicio.getTime()).toBe(new Date(2026, 4, 25, 0, 0).getTime());
  });

  it("devuelve la ventana actual sin tocar", () => {
    const actual = { inicio: new Date(2026, 5, 1), fin: new Date(2026, 5, 8) };
    expect(resolverVentanas(actual).actual).toBe(actual);
  });
});

describe("ventanaUltimaSemana", () => {
  it("son los 7 días previos a la referencia", () => {
    const ref = new Date(2026, 5, 9, 12, 0);
    const v = ventanaUltimaSemana(ref);
    expect(v.fin.getTime()).toBe(ref.getTime());
    expect(v.inicio.getTime()).toBe(new Date(2026, 5, 2, 12, 0).getTime());
  });
});
