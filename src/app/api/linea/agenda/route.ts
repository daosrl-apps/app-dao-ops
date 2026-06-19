/**
 * GET /api/linea/agenda
 *
 * Devuelve las OTs (no canceladas) programadas para hoy y mañana, separadas por
 * día. Es solo-lectura: el operario la usa para ver qué viene en la jornada y la
 * siguiente desde el móvil. No altera el orden de trabajo.
 */
import { NextResponse } from "next/server";
import { requireSessionApi } from "@/lib/auth-guards";
import { resolverAgendaDia } from "@/lib/linea";

export async function GET() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;
  const agenda = await resolverAgendaDia();
  return NextResponse.json(agenda);
}
