import { describe, it, expect } from "vitest";
import { parseColor, normalizar, SIN_COLOR } from "@/lib/color-parser";

describe("normalizar", () => {
  it("pasa a minúsculas y quita tildes", () => {
    expect(normalizar("Marrón")).toBe("marron");
    expect(normalizar("AMARILLO MAÍZ")).toBe("amarillo maiz");
  });
  it("no quita barras ni espacios (match por substring)", () => {
    expect(normalizar("Negro s/mate")).toBe("negro s/mate");
  });
});

describe("parseColor", () => {
  it("matchea un color simple dentro del nombre del artículo", () => {
    expect(parseColor("VAINA T2U15002 NEGRO")).toEqual({ color: "Negro", revisar: false });
  });

  it("prioriza el match más largo: 'Negro texturado' gana a 'Negro'", () => {
    expect(parseColor("PERFIL NEGRO TEXTURADO").color).toBe("Negro texturado");
    expect(parseColor("CHAPA NEGRO").color).toBe("Negro");
    expect(parseColor("BASE NEGRO TEX").color).toBe("Negro tex");
  });

  it("'Gris Shell' gana a 'Gris' y a 'Shell'", () => {
    expect(parseColor("SOPORTE GRIS SHELL").color).toBe("Gris Shell");
  });

  it("'galv' y 'galvanizado' mapean al mismo color canónico", () => {
    expect(parseColor("TUBO GALV").color).toBe("Galv / galvanizado");
    expect(parseColor("TUBO GALVANIZADO").color).toBe("Galv / galvanizado");
  });

  it("tolera tildes en el texto de entrada", () => {
    expect(parseColor("PIEZA MARRÓN").color).toBe("Marrón");
    expect(parseColor("TAPA AMARILLO MAIZ").color).toBe("Amarillo maíz");
  });

  it("sin match devuelve SIN_COLOR y revisar=true", () => {
    expect(parseColor("ARTICULO X SIN DATO")).toEqual({ color: SIN_COLOR, revisar: true });
  });
});
