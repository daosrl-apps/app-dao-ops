import { describe, it, expect } from "vitest";
import { procesarCsvArticulos } from "@/lib/csv-articulos";

const HEADER =
  "Artículo,Cliente,Descripción,Superficie,Perchas,Tiempo x vuelta (min.),Piezas x vuelta,Vel. línea (mts. x min.),Piezas x hora";

describe("procesarCsvArticulos — mapeo por encabezado", () => {
  it("detecta el header y mapea las columnas por nombre", () => {
    const csv = `${HEADER}\nVAINA NEGRO,Fric Rot,desc libre,1.5,2,3,4,0.5,120`;
    const r = procesarCsvArticulos(csv);
    expect(r.filasOk).toBe(1);
    expect(r.filasError).toBe(0);
    expect(r.totalFilas).toBe(1);
    const f = r.filas[0];
    expect(f.codigo).toBe("VAINA NEGRO");
    expect(f.cliente).toBe("Fric Rot");
    expect(f.descripcion).toBe("desc libre");
    expect(f.superficieM2).toBe(1.5);
    expect(f.piezasPorHora).toBe(120);
    expect(f.color).toBe("Negro");
    expect(f.colorRevisar).toBe(false);
  });
});

describe("procesarCsvArticulos — orden fijo sin header", () => {
  it("cae al orden canónico de columnas cuando no hay encabezado", () => {
    const r = procesarCsvArticulos("AB12 AZUL,ACME,desc,2,,,,,75");
    expect(r.filasOk).toBe(1);
    const f = r.filas[0];
    expect(f.codigo).toBe("AB12 AZUL");
    expect(f.cliente).toBe("ACME");
    expect(f.superficieM2).toBe(2);
    expect(f.piezasPorHora).toBe(75);
    expect(f.color).toBe("Azul");
  });
});

describe("procesarCsvArticulos — validaciones de fila", () => {
  it("error si falta el código", () => {
    const r = procesarCsvArticulos(",ACME,d,,,,,,100");
    expect(r.filasOk).toBe(0);
    expect(r.errores[0].motivo).toMatch(/c[oó]digo/i);
  });

  it("error si falta el cliente", () => {
    const r = procesarCsvArticulos("COD1 ROJO,,d,,,,,,100");
    expect(r.filasError).toBe(1);
    expect(r.errores[0].motivo).toMatch(/cliente/i);
  });

  it("error si piezas por hora es inválido o <= 0", () => {
    expect(procesarCsvArticulos("COD1 ROJO,ACME,d,,,,,,abc").errores[0].motivo).toMatch(/piezas/i);
    expect(procesarCsvArticulos("COD1 ROJO,ACME,d,,,,,,0").errores[0].motivo).toMatch(/piezas/i);
  });

  it("error si la superficie es negativa", () => {
    const r = procesarCsvArticulos("COD AZUL,ACME,d,-2,,,,,100");
    expect(r.errores[0].motivo).toMatch(/superficie/i);
  });

  it("color no reconocido => colorRevisar y contador articulosSinColor", () => {
    const r = procesarCsvArticulos("PIEZA RARA,ACME,,,,,,,100");
    expect(r.filasOk).toBe(1);
    expect(r.filas[0].colorRevisar).toBe(true);
    expect(r.articulosSinColor).toBe(1);
    // Campos opcionales vacíos => null.
    expect(r.filas[0].descripcion).toBeNull();
    expect(r.filas[0].superficieM2).toBeNull();
  });
});
