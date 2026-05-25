/**
 * Mini parser de CSV. Maneja:
 *  - Separadores `,` o `;` (auto-detección por primera línea).
 *  - Campos entrecomillados con `"` y comillas dobles internas `""`.
 *  - CRLF / LF.
 *
 * No es papaparse (no soporta todos los edge cases), pero alcanza para los CSVs
 * exportados desde Excel/Sheets que es lo que el admin va a subir.
 */

export interface ParseCsvResult {
  /// Filas como arrays de strings (header incluida si la hay).
  rows: string[][];
  separator: "," | ";";
}

export function parseCsv(text: string): ParseCsvResult {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const sep = detectSeparator(text);
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

function detectSeparator(text: string): "," | ";" {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commas = (firstLine.match(/,/g) ?? []).length;
  const puntoComa = (firstLine.match(/;/g) ?? []).length;
  return puntoComa > commas ? ";" : ",";
}

/** Convierte un string a número aceptando "," o "." como decimal. */
export function parseNumeroLatam(s: string): number | null {
  const limpio = s.trim().replace(/\./g, "").replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}
