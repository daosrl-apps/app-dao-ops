/**
 * POST /api/linea/reanudar
 * Cierra la Pausa abierta de la OT EN_CURSO seteando `fin = now`.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { registrarAuditoria } from "@/lib/auditoria";

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

  const pausa = orden.pausas[0];
  const fin = new Date();
  await prisma.pausa.update({ where: { id: pausa.id }, data: { fin } });

  const durSeg = Math.round((fin.getTime() - pausa.inicio.getTime()) / 1000);
  await registrarAuditoria(prisma, {
    tipo: "REANUDAR",
    entidad: "Pausa",
    entidadId: pausa.id,
    resumen: `Reanudó la OT #${orden.numero} (pausa de ${Math.round(durSeg / 60)} min)`,
    detalle: { ordenId: orden.id, ordenNumero: orden.numero, durSeg },
    usuario: { id: auth.claims.sub, name: auth.claims.name },
  });

  return NextResponse.json({ ok: true, pausaId: pausa.id, durSeg });
}
