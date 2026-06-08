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
import { GAP_BASE_SEG, CAMBIO_COLOR_SEG, minimoInicio } from "@/lib/schedule";

export async function GET(req: NextRequest) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");
  const color = (searchParams.get("color") ?? "").trim();

  // "Última OT activa": tomamos la que tiene mayor finTeorico entre las que
  // están PENDIENTE o EN_CURSO. La FINALIZADA no cuenta porque ya pasó.
  const ultima = await prisma.ordenTrabajo.findFirst({
    where: { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
    orderBy: { finTeorico: "desc" },
    select: {
      id: true,
      numero: true,
      tipo: true,
      color: true,
      finTeorico: true,
    },
  });

  if (!ultima) {
    const now = new Date();
    return NextResponse.json({
      sugerido: now.toISOString(),
      minimo: now.toISOString(),
      gapSeg: 0,
      razon: "sin_orden_previa",
      ordenAnterior: null,
    });
  }

  // Calculamos el gap aplicable contra esta nueva OT hipotética.
  let gapSeg = GAP_BASE_SEG;
  let razon: "base" | "cambio_color" = "base";
  if (tipo === "PINTURA" && ultima.tipo === "PINTURA") {
    const cambiaColor = ultima.color.trim().toLowerCase() !== color.toLowerCase();
    if (cambiaColor) {
      gapSeg = GAP_BASE_SEG + CAMBIO_COLOR_SEG;
      razon = "cambio_color";
    }
  }

  const sugerido = minimoInicio(ultima.finTeorico, gapSeg);
  return NextResponse.json({
    sugerido: sugerido.toISOString(),
    minimo: sugerido.toISOString(),
    gapSeg,
    razon,
    ordenAnterior: {
      id: ultima.id,
      numero: ultima.numero,
      finTeorico: ultima.finTeorico.toISOString(),
      color: ultima.color,
      tipo: ultima.tipo,
    },
  });
}
