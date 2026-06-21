/**
 * Acceso a las pantallas de TV (`/tv`, `/api/tv/*`) por token compartido.
 *
 * El TV no tiene login por PIN: es un dispositivo fijo. En vez de exponer los
 * datos de producción a cualquiera que abra la URL pública, se protege con un
 * token (`TV_TOKEN` en el entorno). Se abre una vez `/tv?token=XXX`, el
 * middleware valida y deja una cookie httpOnly de larga duración; las requests
 * siguientes (incluida la API) validan la cookie.
 *
 * Este módulo es Edge-safe a propósito (sin imports de Node ni Prisma): lo usa
 * el middleware, que corre en el runtime Edge.
 */
export const TV_COOKIE = "dao_ops_tv";

// 1 año — el TV es un dispositivo fijo, no queremos re-tokenizar seguido.
export const TV_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/**
 * Comparación en tiempo constante para no filtrar el token char-a-char por
 * timing. La diferencia de longitud sí se filtra, pero el token es de longitud
 * fija y aleatoria, así que no aporta nada al atacante.
 */
export function tokenMatches(provided: string, expected: string): boolean {
  if (!expected || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
