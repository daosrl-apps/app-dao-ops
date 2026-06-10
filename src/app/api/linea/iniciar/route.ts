/**
 * POST /api/linea/iniciar
 *
 * Marca como EN_CURSO la próxima OT PENDIENTE (la "actual" del snapshot).
 * Setea `inicioReal = now`.
 *
 * Idempotente si ya hay una OT EN_CURSO.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { registrarAuditoria } from "@/lib/auditoria";

export async function POST() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  const enCurso = await prisma.ordenTrabajo.findFirst({ where: { estado: "EN_CURSO" } });
  if (enCurso) {
    return NextResponse.json({ ok: true, ordenId: enCurso.id, alreadyRunning: true });
  }

  const pendiente = await prisma.ordenTrabajo.findFirst({
    where: { estado: "PENDIENTE" },
    orderBy: { inicioProgramado: "asc" },
  });
  if (!pendiente) {
    return NextResponse.json({ error: "No hay órdenes pendientes" }, { status: 400 });
  }

  await prisma.ordenTrabajo.update({
    where: { id: pendiente.id },
    data: { estado: "EN_CURSO", inicioReal: new Date() },
  });

  await registrarAuditoria(prisma, {
    tipo: "INICIAR",
    entidad: "OT",
    entidadId: pendiente.id,
    resumen: `Inició la OT #${pendiente.numero}`,
    detalle: { ordenNumero: pendiente.numero },
    usuario: { id: auth.claims.sub, name: auth.claims.name },
  });

  return NextResponse.json({ ok: true, ordenId: pendiente.id });
}
