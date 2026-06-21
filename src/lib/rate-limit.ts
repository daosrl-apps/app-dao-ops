/**
 * Rate-limit de login por IP, apoyado en la tabla `AuthEvent` (que ya registra
 * cada `login.fail` / `lockout`). No necesita estado en memoria —sobrevive a
 * reinicios del container— y es suficiente para el volumen de una planta.
 *
 * Objetivo doble:
 *  1. Frenar fuerza bruta de PIN (espacio 10^6, sin lockout por usuario en la
 *     ruta de PIN para no filtrar enumeración).
 *  2. Cortar el DoS amplificado: cada intento de login-PIN corre bcrypt (cost
 *     12) contra el hash de cada usuario activo. Sin freno, pocas requests
 *     concurrentes saturan la CPU. El chequeo es una query barata ANTES de
 *     tocar bcrypt.
 *
 * Se cuentan SOLO los fallos: un login exitoso no consume cupo, así que un
 * operario que entra bien nunca se ve afectado.
 */
import type { PrismaClient } from "@prisma/client";

// Hasta 10 fallos por IP en 5 minutos. Un operario que se equivoca 1-2 veces
// no llega nunca; un bot tirando combinaciones queda frenado al 11°.
export const MAX_FAILS_PER_WINDOW = 10;
export const WINDOW_MS = 5 * 60 * 1000;

export interface RateLimitResult {
  limited: boolean;
  retryAfterSec: number;
}

/**
 * Devuelve `limited: true` si la IP superó el cupo de fallos en la ventana.
 * Si no hay IP (no debería pasar detrás del proxy), no limita —pero igual el
 * login per se sigue protegido por el resto de las defensas.
 */
export async function checkLoginRateLimit(
  prisma: PrismaClient,
  ip: string | null,
): Promise<RateLimitResult> {
  if (!ip) return { limited: false, retryAfterSec: 0 };

  const since = new Date(Date.now() - WINDOW_MS);
  const fails = await prisma.authEvent.count({
    where: {
      ip,
      action: { in: ["login.fail", "lockout"] },
      createdAt: { gte: since },
    },
  });

  if (fails >= MAX_FAILS_PER_WINDOW) {
    return { limited: true, retryAfterSec: Math.ceil(WINDOW_MS / 1000) };
  }
  return { limited: false, retryAfterSec: 0 };
}
