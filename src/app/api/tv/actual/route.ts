/**
 * GET /api/tv/actual
 *
 * Variante "pública dentro de la red" del snapshot de la línea, pensada para
 * la pantalla de TV (no requiere PIN). Si la red interna no es de confianza,
 * proteger esto detrás del firewall del proxy o agregar un token.
 */
import { NextResponse } from "next/server";
import { resolverLineaSnapshot } from "@/lib/linea";

export async function GET() {
  const snapshot = await resolverLineaSnapshot();
  return NextResponse.json(snapshot);
}
