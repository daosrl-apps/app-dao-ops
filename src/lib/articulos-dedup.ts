import type { PrismaClient } from "@prisma/client";
import { normalizarCodigoArticulo } from "@/lib/csv-articulos";

let dedupPromise: Promise<void> | null = null;
let lastDedupAt = 0;

/**
 * Unifica artículos duplicados por ceros a la izquierda (ej. "000017" y "17")
 * para un mismo cliente:
 * 1. Si existe tanto "000017" como "17", conserva el registro "17" (completando
 *    cualquier campo nulo con los datos del "000017"), reasigna todas las
 *    OrdenTrabajo que apunten a "000017" hacia "17", y elimina el duplicado.
 * 2. Si solo existe "000017", le quita los ceros a la izquierda ("17").
 */
export async function deduplicarArticulosConCeros(
  prisma: PrismaClient,
  force = false,
): Promise<void> {
  const now = Date.now();
  // Evitar consultas repetidas en cada request si ya se verificó recientemente
  if (!force && now - lastDedupAt < 60_000) {
    return;
  }
  if (dedupPromise) {
    return dedupPromise;
  }

  dedupPromise = (async () => {
    try {
      const conCeros = await prisma.articulo.findMany({
        where: { codigo: { startsWith: "0" } },
      });

      const candidatos = conCeros.filter(
        (a) => /^0+\d+$/.test(a.codigo.trim()) && normalizarCodigoArticulo(a.codigo) !== a.codigo,
      );

      if (candidatos.length === 0) {
        lastDedupAt = Date.now();
        return;
      }

      for (const dup of candidatos) {
        const codigoNorm = normalizarCodigoArticulo(dup.codigo);
        const existente = await prisma.articulo.findUnique({
          where: {
            clienteId_codigo: {
              clienteId: dup.clienteId,
              codigo: codigoNorm,
            },
          },
        });

        if (existente && existente.id !== dup.id) {
          await prisma.$transaction([
            prisma.articulo.update({
              where: { id: existente.id },
              data: {
                descripcion: existente.descripcion ?? dup.descripcion,
                superficieM2: existente.superficieM2 ?? dup.superficieM2,
                perchas: existente.perchas ?? dup.perchas,
                tiempoVueltaMin: existente.tiempoVueltaMin ?? dup.tiempoVueltaMin,
                piezasPorVuelta: existente.piezasPorVuelta ?? dup.piezasPorVuelta,
                velLineaMtsMin: existente.velLineaMtsMin ?? dup.velLineaMtsMin,
                configPerchas: existente.configPerchas ?? dup.configPerchas,
                ...(existente.colorRevisar && !dup.colorRevisar
                  ? { color: dup.color, colorRevisar: false }
                  : {}),
              },
            }),
            prisma.ordenTrabajo.updateMany({
              where: { articuloId: dup.id },
              data: { articuloId: existente.id },
            }),
            prisma.articulo.delete({
              where: { id: dup.id },
            }),
          ]);
        } else if (!existente) {
          await prisma.articulo.update({
            where: { id: dup.id },
            data: { codigo: codigoNorm },
          });
        }
      }

      lastDedupAt = Date.now();
    } catch (err) {
      console.error("Error deduplicando artículos con ceros:", err);
    } finally {
      dedupPromise = null;
    }
  })();

  return dedupPromise;
}
