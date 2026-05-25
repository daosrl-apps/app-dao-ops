/**
 * GET /api/linea/actual
 *
 * Devuelve el "snapshot" de la línea para el operario / la pantalla de TV:
 *  - itemActual   → el ítem EN_CURSO (o el primero PENDIENTE si no hay nada
 *                   en curso aún). Incluye datos de tiempos reales y pausas.
 *  - itemAnterior → el último ítem FINALIZADO (mismo PCP si hay actual, si no
 *                   el más reciente).
 *  - itemSiguiente → el próximo PENDIENTE (excluyendo el actual).
 *
 * Es público dentro del scope autenticado — operario lee esto, TV también
 * (vía endpoint paralelo no-auth, ver /api/tv/actual).
 */
import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth-guards";
import { resolverLineaSnapshot } from "@/lib/linea";

export async function GET() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;
  const snapshot = await resolverLineaSnapshot();
  return NextResponse.json(snapshot);
}
