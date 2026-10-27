/**
 * GET /api/ordenes/sugerencia?tipo=PINTURA&color=Rojo
 *
 * Devuelve el horario sugerido para la próxima OT, calculado a partir del fin
 * de la última OT activa (PENDIENTE o EN_CURSO) más el gap (15 min base, +30
 * si cambia de color respecto de la anterior PINTURA).
 *
 * Si no hay OTs activas, sugiere `now` (el supervisor decide).
 *
 * Respuesta:
 *   {
 *     sugerido: ISOString,        // horario sugerido (= mínimo permitido)
 *     minimo: ISOString,          // alias de sugerido (claridad para el cliente)
 *     gapSeg: number,             // 900 (15 min) o 2700 (45 min)
 *     razon: "base" | "cambio_color" | "sin_orden_previa",
 *     ordenAnterior: {            // null si no hay
 *       id, numero, finTeorico, color, tipo
 *     } | null
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { ceilAMinuto } from "@/lib/schedule";

export async function GET(req: NextRequest) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const color = (searchParams.get("color") ?? "").trim();

  // 1. "Última OT activa": PENDIENTE o EN_CURSO (define el inicio mínimo no solapado)
  const ultimaActiva = await prisma.ordenTrabajo.findFirst({
    where: { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
    orderBy: { finTeorico: "desc" },
    select: {
      id: true,
      numero: true,
      tipo: true,
      color: true,
      finTeorico: true,
      estado: true,
      articulo: {
        select: {
          codigo: true,
          descripcion: true,
        },
      },
    },
  });

  // 2. Si no hay activa, buscamos la última registrada (ej. FINALIZADA) para saber qué artículo/color estuvo en línea
  const ultima =
    ultimaActiva ??
    (await prisma.ordenTrabajo.findFirst({
      orderBy: { finTeorico: "desc" },
      select: {
        id: true,
        numero: true,
        tipo: true,
        color: true,
        finTeorico: true,
        estado: true,
        articulo: {
          select: {
            codigo: true,
            descripcion: true,
          },
        },
      },
    }));

  const now = new Date();

  if (!ultima) {
    return NextResponse.json({
      sugerido: now.toISOString(),
      minimo: now.toISOString(),
      gapSeg: 0,
      razon: "sin_orden_previa",
      ordenAnterior: null,
    });
  }

  const esActiva = !!ultimaActiva;
  const minimo = esActiva ? ceilAMinuto(ultimaActiva.finTeorico) : now;

  return NextResponse.json({
    sugerido: minimo.toISOString(),
    minimo: minimo.toISOString(),
    gapSeg: 0,
    razon: esActiva ? "con_orden_previa" : "sin_orden_activa",
    ordenAnterior: {
      id: ultima.id,
      numero: ultima.numero,
      finTeorico: ultima.finTeorico.toISOString(),
      color: ultima.color,
      tipo: ultima.tipo,
      estado: ultima.estado,
      esActiva,
      codigo: ultima.articulo?.codigo ?? null,
      descripcion: ultima.articulo?.descripcion ?? null,
    },
  });
}
