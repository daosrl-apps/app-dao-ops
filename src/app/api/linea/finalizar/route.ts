/**
 * POST /api/linea/finalizar
 *
 * Marca como FINALIZADO el ítem EN_CURSO actual. Si hay pausa abierta, la
 * cierra antes. Si era el último ítem del PCP, marca el PCP como FINALIZADO.
 *
 * Adicionalmente recalcula `inicioTeorico` / `finTeorico` de los ítems que
 * quedan PENDIENTE en el PCP. El recálculo arranca desde `now` (el momento
 * en que se finalizó este ítem) y propaga adelante usando las duraciones
 * teóricas + tiempos de cambio de la lib `schedule`. Así, la pantalla de TV
 * y el timeline muestran horarios estimados que reflejan la demora real.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { planificar, type ItemPlan } from "@/lib/schedule";

export async function POST() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  const item = await prisma.item.findFirst({
    where: { estado: "EN_CURSO" },
    include: { pausas: { where: { fin: null } } },
  });
  if (!item) return NextResponse.json({ error: "No hay ítem en curso" }, { status: 400 });

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const p of item.pausas) {
      await tx.pausa.update({ where: { id: p.id }, data: { fin: now } });
    }
    await tx.item.update({
      where: { id: item.id },
      data: { estado: "FINALIZADO", finReal: now },
    });

    // Recálculo de pendientes: tomamos todos los items PENDIENTE de este PCP
    // ordenados, los re-planificamos arrancando en `now` y escribimos sus
    // nuevos inicio/fin teóricos.
    const pendientes = await tx.item.findMany({
      where: { pcpId: item.pcpId, estado: "PENDIENTE" },
      orderBy: { orden: "asc" },
      include: { articulo: { select: { piezasPorHora: true } } },
    });

    if (pendientes.length === 0) {
      await tx.pcp.update({ where: { id: item.pcpId }, data: { estado: "FINALIZADO" } });
      return;
    }

    const plan: ItemPlan[] = pendientes.map((it, idx) => ({
      index: idx,
      tipo: it.tipo,
      cantidadPiezas: it.cantidad,
      piezasPorHora: it.articulo.piezasPorHora,
      color: it.color,
      configPerchas: it.configPerchas,
      piezasPorPercha: it.piezasPorPercha,
      velocidadLavado: it.velocidadLavado,
    }));
    const schedule = planificar(plan, now);

    for (let i = 0; i < pendientes.length; i++) {
      await tx.item.update({
        where: { id: pendientes[i].id },
        data: {
          inicioTeorico: schedule[i].inicio,
          finTeorico: schedule[i].fin,
        },
      });
    }
  });

  return NextResponse.json({ ok: true });
}
