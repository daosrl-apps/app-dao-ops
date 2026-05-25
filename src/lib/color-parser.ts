/**
 * Parser de color para artículos del CSV (columna B = nombre/código).
 *
 * Reglas:
 *  - Lista cerrada de colores (CATALOGO_COLORES).
 *  - Match case-insensitive y tolerante a tildes.
 *  - **Match más largo primero** (es crítico): "Negro texturado" debe ganarle
 *    a "Negro", "Gris Shell" a "Gris", etc.
 *  - "Galv" y "galvanizado" son el mismo color (`Galv / galvanizado`).
 *  - Si nada matchea, devuelve `SIN_COLOR` con `revisar = true`.
 */

export const SIN_COLOR = "Sin color / Revisar";

/// Catálogo cerrado de colores (sección 3.2 de la spec).
export const CATALOGO_COLORES = [
  "Aluminio",
  "Amarillo",
  "Azul",
  "Beige",
  "Blanco",
  "Grafito",
  "Gris",
  "Marrón",
  "Naranja",
  "Negro",
  "Ocre",
  "Platil",
  "Rojo",
  "Rosa",
  "Verde",
  "Amarillo maíz",
  "Blanco brillante",
  "Fluor naranja",
  "Fluor rosa",
  "Fluor verde",
  "Gris Shell",
  "Gris Stara",
  "Gris topo",
  "Negro texturado",
  "Negro tex",
  "Negro s/mate",
  "Galv / galvanizado",
  "Estrellita",
  "Shell",
] as const;

export type ColorCatalogo = (typeof CATALOGO_COLORES)[number];

/** Lista de patrones que se buscan dentro del texto del artículo. Para cada
 *  color canónico del catálogo se generan uno o más alias (ej: "Galv /
 *  galvanizado" → ["galv", "galvanizado"]).
 *  La lista se ordena por longitud descendente del alias para que el matcher
 *  agarre primero el más específico.
 */
interface Patron {
  alias: string; // normalizado (lower, sin tildes)
  canonico: ColorCatalogo;
}

function buildPatrones(): Patron[] {
  const patrones: Patron[] = [];
  for (const color of CATALOGO_COLORES) {
    if (color === "Galv / galvanizado") {
      patrones.push({ alias: normalizar("galv"), canonico: color });
      patrones.push({ alias: normalizar("galvanizado"), canonico: color });
    } else {
      patrones.push({ alias: normalizar(color), canonico: color });
    }
  }
  // Orden descendente por longitud del alias — clave para que
  // "negro texturado" gane a "negro".
  patrones.sort((a, b) => b.alias.length - a.alias.length);
  return patrones;
}

const PATRONES = buildPatrones();

/** Normaliza: lowercase + quita diacríticos (tildes, acentos). No quita
 *  espacios ni caracteres especiales como "/" — el parser hace match por
 *  substring directo, así que un alias "negro s/mate" debe poder encontrar
 *  literalmente "negro s/mate" en el texto.
 */
export function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // quita combining marks (tildes)
}

export interface ColorMatch {
  /** Color canónico del catálogo, o `SIN_COLOR` si no hubo match. */
  color: string;
  /** true si no se detectó un color del catálogo (artículo a revisar). */
  revisar: boolean;
}

/**
 * Extrae el color del nombre/código del artículo.
 * Devuelve `{ color, revisar }`. Si no matchea ningún patrón, `color =
 * SIN_COLOR` y `revisar = true`.
 */
export function parseColor(nombreArticulo: string): ColorMatch {
  const texto = normalizar(nombreArticulo);
  for (const p of PATRONES) {
    if (texto.includes(p.alias)) {
      return { color: p.canonico, revisar: false };
    }
  }
  return { color: SIN_COLOR, revisar: true };
}
