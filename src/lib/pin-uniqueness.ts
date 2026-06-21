/**
 * Chequeo de unicidad de PIN entre usuarios activos.
 *
 * Los PIN se guardan hasheados con bcrypt (salt distinto por usuario), así que
 * no se puede consultar por igualdad: hay que comparar el PIN candidato contra
 * cada hash. Es O(n) en el plantel (decenas), y es una acción de admin poco
 * frecuente, así que el costo no importa.
 *
 * Si dos operarios compartieran PIN, el login (`/api/auth/login`) matchearía al
 * primero que devuelva `compare` true — comportamiento ambiguo. Por eso lo
 * rechazamos en el alta/edición.
 */
import { prisma } from "@/lib/db";
import { comparePin } from "@/lib/pin";

/**
 * Devuelve true si algún usuario activo (distinto de `excludeUserId`) ya tiene
 * este PIN.
 */
export async function pinYaEnUso(pin: string, excludeUserId?: string): Promise<boolean> {
  const usuarios = await prisma.user.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      pinHash: { not: null },
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
    select: { pinHash: true },
  });

  for (const u of usuarios) {
    if (u.pinHash && (await comparePin(pin, u.pinHash))) return true;
  }
  return false;
}
