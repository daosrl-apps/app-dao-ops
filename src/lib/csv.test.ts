import { describe, it, expect } from "vitest";
import { parseCsv, parseNumeroLatam } from "@/lib/csv";

describe("parseCsv", () => {
  it("parsea filas y columnas simples", () => {
    expect(parseCsv("a,b,c\n1,2,3").rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("respeta comas dentro de campos entrecomillados", () => {
    expect(parseCsv('"a,b",c').rows).toEqual([["a,b", "c"]]);
  });

  it("desescapa comillas dobles internas", () => {
    expect(parseCsv('"dijo ""hola""",x').rows).toEqual([['dijo "hola"', "x"]]);
  });

  it("maneja CRLF y no deja CR en los campos", () => {
    expect(parseCsv("a,b\r\n1,2\r\n").rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("descarta el BOM inicial", () => {
    expect(parseCsv("﻿a,b").rows).toEqual([["a", "b"]]);
  });

  it("filtra filas completamente vacías", () => {
    expect(parseCsv("a,b\n\n \nc,d").rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("toma el último campo aunque no termine en salto de línea", () => {
    expect(parseCsv("x,y,z").rows).toEqual([["x", "y", "z"]]);
  });
});

describe("parseNumeroLatam", () => {
  it("parsea enteros y decimales con punto", () => {
    expect(parseNumeroLatam("120")).toBe(120);
    expect(parseNumeroLatam("12.5")).toBe(12.5);
  });
  it("recorta espacios", () => {
    expect(parseNumeroLatam("  7 ")).toBe(7);
  });
  it("devuelve null para vacío o no numérico", () => {
    expect(parseNumeroLatam("")).toBeNull();
    expect(parseNumeroLatam("   ")).toBeNull();
    expect(parseNumeroLatam("abc")).toBeNull();
  });
});
