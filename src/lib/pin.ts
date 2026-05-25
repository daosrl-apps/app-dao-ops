/**
 * Helpers de PIN: hash, comparación, y validación de formato.
 * Usamos bcrypt con cost 12 — el PIN tiene baja entropía (6 dígitos = 10^6),
 * así que el costo del hash es la última línea contra fuerza bruta offline.
 */
import bcrypt from "bcryptjs";

const PIN_REGEX = /^\d{6}$/;
const BCRYPT_COST = 12;

export function isValidPinFormat(pin: string): boolean {
  return PIN_REGEX.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  if (!isValidPinFormat(pin)) {
    throw new Error("El PIN debe ser exactamente 6 dígitos.");
  }
  return bcrypt.hash(pin, BCRYPT_COST);
}

export async function comparePin(pin: string, hash: string): Promise<boolean> {
  if (!isValidPinFormat(pin)) return false;
  return bcrypt.compare(pin, hash);
}

// ---- Lockout ---------------------------------------------------------------
// Después de 5 intentos fallidos consecutivos, bloqueamos 5 minutos.
// Razonable para un ambiente de planta donde un operario se puede equivocar 1-2
// veces, pero un bot tirando combinaciones queda frenado.
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_DURATION_MS = 5 * 60 * 1000;
