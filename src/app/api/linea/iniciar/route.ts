/**
 * POST /api/linea/iniciar
 *
 * Marca como EN_CURSO el siguiente ítem PENDIENTE (el "actual" del snapshot).
 * Setea `inicioReal = now`, marca el PCP padre como EN_CURSO si estaba en
 * PENDIENTE.
 *
 * Idempotente si el ítem ya está EN_CURSO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";

export async function POST() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  const enCurso = await prisma.item.findFirst({ where: { estado: "EN_CURSO" } });
  if (enCurso) {
    return NextResponse.json({ ok: true, itemId: enCurso.id, alreadyRunning: true });
  }

  const pendiente = await prisma.item.findFirst({
    where: {
      estado: "PENDIENTE",
      pcp: { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
    },
    orderBy: [{ pcp: { inicio: "asc" } }, { orden: "asc" }],
  });
  if (!pendiente) {
    return NextResponse.json({ error: "No hay ítems pendientes" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.item.update({
      where: { id: pendiente.id },
      data: { estado: "EN_CURSO", inicioReal: new Date() },
    }),
    prisma.pcp.update({
      where: { id: pendiente.pcpId },
      data: { estado: "EN_CURSO" },
    }),
  ]);

  return NextResponse.json({ ok: true, itemId: pendiente.id });
}
