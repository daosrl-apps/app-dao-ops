/**
 * Helpers de password (supervisor / admin). PIN tiene su propio módulo
 * (`lib/pin.ts`) porque tiene reglas distintas (formato exacto de 6 dígitos).
 */
import bcrypt from "bcryptjs";

const BCRYPT_COST = 12;
const MIN_LEN = 8;

export function isValidPasswordFormat(password: string): boolean {
  return typeof password === "string" && password.length >= MIN_LEN && password.length <= 200;
}

export async function hashPassword(password: string): Promise<string> {
  if (!isValidPasswordFormat(password)) {
    throw new Error(`La contraseña debe tener entre ${MIN_LEN} y 200 caracteres.`);
  }
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0) return false;
  return bcrypt.compare(password, hash);
}

export function isValidUsername(username: string): boolean {
  return /^[a-zA-Z0-9._-]{3,40}$/.test(username);
}
