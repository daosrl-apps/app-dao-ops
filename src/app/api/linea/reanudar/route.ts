/**
 * POST /api/linea/reanudar
 * Cierra la Pausa abierta de la OT EN_CURSO seteando `fin = now`.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";

export async function POST() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  const orden = await prisma.ordenTrabajo.findFirst({
    where: { estado: "EN_CURSO" },
    include: { pausas: { where: { fin: null }, orderBy: { inicio: "desc" }, take: 1 } },
  });
  if (!orden || orden.pausas.length === 0) {
    return NextResponse.json({ error: "No hay pausa abierta" }, { status: 400 });
  }

  await prisma.pausa.update({
    where: { id: orden.pausas[0].id },
    data: { fin: new Date() },
  });
  return NextResponse.json({ ok: true });
}
