import { describe, it, expect } from "vitest";
import { formatFecha, formatFechaHora } from "@/lib/utils";

// Las fechas se construyen al mediodía local para que el día/hora sean
// independientes de la zona horaria del runner (CI corre en UTC, la PC en ART):
// construir y formatear con la misma TZ local da siempre el mismo resultado.

describe("formatFecha", () => {
  it("formatea como dd/mm/aa", () => {
    expect(formatFecha(new Date(2026, 5, 9, 12, 0))).toBe("09/06/26");
    expect(formatFecha(new Date(2026, 0, 1, 12, 0))).toBe("01/01/26");
  });
  it("acepta también un string ISO", () => {
    expect(formatFecha("2026-06-09T12:00:00")).toBe("09/06/26");
  });
});

describe("formatFechaHora", () => {
  it("formatea como 'dd/mm/aa ' + hora (12h o 24h según la plataforma)", () => {
    const s = formatFechaHora(new Date(2026, 5, 9, 14, 30));
    expect(s.startsWith("09/06/26 ")).toBe(true);
    // No fijamos 12h vs 24h (depende del ICU del runner), solo HH:MM con :30.
    expect(s).toMatch(/\d{1,2}:30/);
  });
});
