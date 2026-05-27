/**
 * Pipeline de procesamiento del CSV de artículos:
 *   parseCsv → mapColumnas → parseColor → preview / upsert.
 *
 * El CSV trae columnas indexadas por letra de planilla:
 *   A (0) — nro / nombre del artículo (también es de donde el parser
 *           saca el color)
 *   B (1) — cliente
 *   C (2) — descripción
 *   D (3) — superficie de la pieza en m² (opcional)
 *   I (8) — piezas por hora
 */
import { parseCsv, parseNumeroLatam } from "@/lib/csv";
import { parseColor } from "@/lib/color-parser";

const COL_ARTICULO = 0; // A
const COL_CLIENTE = 1; // B
const COL_DESCRIPCION = 2; // C
const COL_SUPERFICIE = 3; // D
const COL_PIEZAS_HORA = 8; // I

export interface FilaProcesada {
  /// Número de fila original (1-based, incluye header si la había).
  lineaOriginal: number;
  cliente: string;
  codigo: string;
  descripcion: string | null;
  superficieM2: number | null;
  piezasPorHora: number;
  color: string;
  colorRevisar: boolean;
}

export interface FilaError {
  lineaOriginal: number;
  motivo: string;
  /// Contenido bruto para que el admin pueda ubicarla en su CSV.
  preview: string;
}

export interface ProcesoCsvResult {
  totalFilas: number;
  filasOk: number;
  filasError: number;
  articulosSinColor: number;
  filas: FilaProcesada[];
  errores: FilaError[];
}

/**
 * Procesa el texto del CSV. Detecta y descarta el header si lo hay.
 */
export function procesarCsvArticulos(csvText: string): ProcesoCsvResult {
  const { rows } = parseCsv(csvText);
  const filas: FilaProcesada[] = [];
  const errores: FilaError[] = [];

  // Detectar header: la primera fila no parsea piezas/hora como número.
  let start = 0;
  if (rows.length > 0) {
    const first = rows[0];
    const piezas = parseNumeroLatam(first[COL_PIEZAS_HORA] ?? "");
    if (piezas === null) start = 1;
  }

  let articulosSinColor = 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const linea = i + 1;
    const codigo = (r[COL_ARTICULO] ?? "").trim();
    const cliente = (r[COL_CLIENTE] ?? "").trim();
    const descripcionRaw = (r[COL_DESCRIPCION] ?? "").trim();
    const superficieRaw = (r[COL_SUPERFICIE] ?? "").trim();
    const piezasRaw = (r[COL_PIEZAS_HORA] ?? "").trim();

    if (!codigo) {
      errores.push({
        lineaOriginal: linea,
        motivo: "Falta el código del artículo (columna A)",
        preview: r.join(" | "),
      });
      continue;
    }
    if (!cliente) {
      errores.push({
        lineaOriginal: linea,
        motivo: "Falta el cliente (columna B)",
        preview: r.join(" | "),
      });
      continue;
    }
    const piezasPorHora = parseNumeroLatam(piezasRaw);
    if (piezasPorHora === null || piezasPorHora <= 0) {
      errores.push({
        lineaOriginal: linea,
        motivo: `Piezas por hora inválido (columna I): "${piezasRaw}"`,
        preview: r.join(" | "),
      });
      continue;
    }

    // Superficie es opcional: si está vacía → null. Si tiene algo no parseable
    // o negativo, se considera error de fila.
    let superficieM2: number | null = null;
    if (superficieRaw !== "") {
      const s = parseNumeroLatam(superficieRaw);
      if (s === null || s < 0) {
        errores.push({
          lineaOriginal: linea,
          motivo: `Superficie inválida (columna D): "${superficieRaw}"`,
          preview: r.join(" | "),
        });
        continue;
      }
      superficieM2 = s;
    }

    const { color, revisar } = parseColor(codigo);
    if (revisar) articulosSinColor++;

    filas.push({
      lineaOriginal: linea,
      cliente,
      codigo,
      descripcion: descripcionRaw || null,
      superficieM2,
      piezasPorHora,
      color,
      colorRevisar: revisar,
    });
  }

  return {
    totalFilas: rows.length - start,
    filasOk: filas.length,
    filasError: errores.length,
    articulosSinColor,
    filas,
    errores,
  };
}
