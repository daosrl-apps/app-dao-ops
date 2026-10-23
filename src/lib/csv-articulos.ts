/**
 * Pipeline de procesamiento del CSV de artículos:
 *   parseCsv → mapColumnas (por nombre de encabezado) → parseColor → preview / upsert.
 *
 * Estructura esperada del CSV (con encabezado en la primera fila):
 *   Artículo, Cliente, Descripción, Superficie, Perchas,
 *   "Tiempo x vuelta (min.)", "Piezas x vuelta", "Vel. línea (mts. x min.)",
 *   "Piezas x hora"
 *
 * El mapeo se hace por NOMBRE de columna (normalizado), no por posición fija:
 * así el cálculo no se rompe si el CSV trae columnas corridas o de más. Si no
 * hay encabezado reconocible, se cae al orden fijo canónico de arriba.
 *
 * El cálculo de la duración de la OT usa "Piezas x hora":
 *   tiempo_pintura = cantidad / piezasPorHora * 3600.
 */
import { parseCsv, parseNumeroLatam } from "@/lib/csv";
import { parseColor } from "@/lib/color-parser";

/// Índices fijos del orden canónico (fallback si no hay encabezado).
const FIJO = {
  codigo: 0,
  cliente: 1,
  descripcion: 2,
  superficie: 3,
  perchas: 4,
  tiempoVuelta: 5,
  piezasVuelta: 6,
  velLinea: 7,
  piezasHora: 8,
} as const;

type CampoCsv = keyof typeof FIJO;

export interface FilaProcesada {
  /// Número de fila original (1-based, incluye header si la había).
  lineaOriginal: number;
  cliente: string;
  codigo: string;
  descripcion: string | null;
  superficieM2: number | null;
  perchas: number | null;
  tiempoVueltaMin: number | null;
  piezasPorVuelta: number | null;
  velLineaMtsMin: number | null;
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

/** Normaliza un texto para comparar encabezados: minúsculas, sin acentos, sin puntuación. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\ufffd/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Busca la fila de encabezado en las primeras filas del archivo (útil si viene precedida
 * por metadatos como "Fecha: ... Hora: ...").
 * Devuelve el índice de la fila del encabezado y el mapeo de columnas.
 * Si no encuentra encabezado, devuelve headerIndex = -1 y el orden fijo canónico.
 */
function encontrarHeader(rows: string[][]): {
  headerIndex: number;
  map: Record<CampoCsv, number>;
} {
  const limite = Math.min(rows.length, 15);
  for (let idx = 0; idx < limite; idx++) {
    const celdas = rows[idx].map(norm);
    const esHeader = celdas.some(
      (c) =>
        c.includes("articulo") ||
        c.includes("cliente") ||
        (c.includes("piezas") && c.includes("hora")),
    );
    if (esHeader) {
      const map: Record<CampoCsv, number> = { ...FIJO };
      celdas.forEach((c, colIdx) => {
        if (c.includes("articulo")) map.codigo = colIdx;
        else if (c.includes("cliente")) map.cliente = colIdx;
        else if (c.includes("descripcion")) map.descripcion = colIdx;
        else if (c.includes("superficie")) map.superficie = colIdx;
        else if (c.includes("piezas") && c.includes("hora")) map.piezasHora = colIdx;
        else if (c.includes("piezas") && c.includes("vuelta")) map.piezasVuelta = colIdx;
        else if (c.includes("tiempo") && c.includes("vuelta")) map.tiempoVuelta = colIdx;
        else if (c.includes("vel") && c.includes("linea")) map.velLinea = colIdx;
        else if (c.includes("percha")) map.perchas = colIdx;
      });
      return { headerIndex: idx, map };
    }
  }

  return { headerIndex: -1, map: { ...FIJO } };
}

function numOpcional(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  return parseNumeroLatam(t);
}

/**
 * Procesa el texto del CSV. Detecta y descarta el header si lo hay; mapea las
 * columnas por nombre.
 */
export function procesarCsvArticulos(csvText: string): ProcesoCsvResult {
  const { rows } = parseCsv(csvText);
  const filas: FilaProcesada[] = [];
  const errores: FilaError[] = [];

  if (rows.length === 0) {
    return { totalFilas: 0, filasOk: 0, filasError: 0, articulosSinColor: 0, filas, errores };
  }

  const { headerIndex, map } = encontrarHeader(rows);
  const start = headerIndex >= 0 ? headerIndex + 1 : 0;
  const cell = (r: string[], campo: CampoCsv) => (r[map[campo]] ?? "").trim();

  let articulosSinColor = 0;
  for (let i = start; i < rows.length; i++) {
    const r = rows[i];
    const linea = i + 1;

    // Fila completamente vacía → ignorar
    if (!r.some((c) => c.trim().length > 0)) continue;

    const codigo = cell(r, "codigo");
    const cliente = cell(r, "cliente");

    if (!codigo) {
      errores.push({
        lineaOriginal: linea,
        motivo: "Falta el código del artículo",
        preview: r.join(" | "),
      });
      continue;
    }
    if (!cliente) {
      errores.push({
        lineaOriginal: linea,
        motivo: "Falta el cliente",
        preview: r.join(" | "),
      });
      continue;
    }

    const piezasPorHora = parseNumeroLatam(cell(r, "piezasHora"));
    if (piezasPorHora === null || piezasPorHora <= 0) {
      errores.push({
        lineaOriginal: linea,
        motivo: `Piezas por hora inválido: "${cell(r, "piezasHora")}"`,
        preview: r.join(" | "),
      });
      continue;
    }

    // Superficie es opcional: si está vacía → null. Si tiene algo no parseable
    // o negativo, se considera error de fila.
    let superficieM2: number | null = null;
    const superficieRaw = cell(r, "superficie");
    if (superficieRaw !== "") {
      const s = parseNumeroLatam(superficieRaw);
      if (s === null || s < 0) {
        errores.push({
          lineaOriginal: linea,
          motivo: `Superficie inválida: "${superficieRaw}"`,
          preview: r.join(" | "),
        });
        continue;
      }
      superficieM2 = s;
    }

    const descripcion = cell(r, "descripcion") || null;
    const textoColor = [descripcion, codigo].filter(Boolean).join(" ");
    const { color, revisar } = parseColor(textoColor);
    if (revisar) articulosSinColor++;

    filas.push({
      lineaOriginal: linea,
      cliente,
      codigo,
      descripcion: cell(r, "descripcion") || null,
      superficieM2,
      perchas: numOpcional(cell(r, "perchas")),
      tiempoVueltaMin: numOpcional(cell(r, "tiempoVuelta")),
      piezasPorVuelta: numOpcional(cell(r, "piezasVuelta")),
      velLineaMtsMin: numOpcional(cell(r, "velLinea")),
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
