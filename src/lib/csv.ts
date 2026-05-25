/**
 * Mini parser de CSV. Maneja:
 *  - Separador `,` fijo (el CSV del cliente usa coma siempre).
 *  - Campos entrecomillados con `"` y comillas dobles internas `""`.
 *  - CRLF / LF.
 *
 * No es papaparse (no soporta todos los edge cases), pero alcanza para los CSVs
 * exportados desde Excel/Sheets que es lo que el admin va a subir.
 */

export interface ParseCsvResult {
  /// Filas como arrays de strings (header incluida si la hay).
  rows: string[][];
  separator: ",";
}

export function parseCsv(text: string): ParseCsvResult {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const sep = "," as const;
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === sep) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      // Ignoramos CR; LF dispara fin de fila.
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Último campo / fila si no termina en \n.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Filtramos filas vacías por completo.
  const limpio = rows.filter((r) => r.some((c) => c.trim().length > 0));
  return { rows: limpio, separator: sep };
}

/**
 * Convierte un string a número. Acepta `.` como separador decimal y miles
 * sin separador (es lo que sale del CSV con sep `,`). No usamos coma decimal
 * acá porque rompería con el separador de columnas.
 */
export function parseNumeroLatam(s: string): number | null {
  const limpio = s.trim();
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}
