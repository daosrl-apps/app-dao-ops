/**
 * PATCH /api/pcp/[id]/reorder
 * Body: { ordenIds: string[] }   // ids de los ítems en su nuevo orden
 *
 * Solo pueden moverse ítems PENDIENTE; los EN_CURSO y FINALIZADO mantienen su
 * posición original. Si el body intenta mover uno de esos, devolvemos 400.
 * Tras reordenar, recalculamos `inicioTeorico` / `finTeorico` de los ítems
 * PENDIENTE (los ya iniciados conservan sus tiempos reales).
 *
 * Roles: SUPERVISOR o ADMIN.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { planificar, type ItemPlan } from "@/lib/schedule";

const Body = z.object({
  ordenIds: z.array(z.string().min(1)).min(1),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const { ordenIds } = parsed.data;

  const pcp = await prisma.pcp.findUnique({
    where: { id },
    include: {
      items: {
        include: { articulo: { select: { piezasPorHora: true, configPerchas: true } } },
        orderBy: { orden: "asc" },
      },
    },
  });
  if (!pcp) return NextResponse.json({ error: "PCP no encontrado" }, { status: 404 });

  // Validar que ordenIds contiene exactamente los mismos ids que el PCP.
  const idsActuales = new Set(pcp.items.map((i) => i.id));
  const idsNuevos = new Set(ordenIds);
  if (idsActuales.size !== idsNuevos.size || ordenIds.length !== pcp.items.length) {
    return NextResponse.json(
      { error: "ordenIds debe contener todos los ítems del PCP, una sola vez" },
      { status: 400 },
    );
  }
  for (const idNew of idsNuevos) {
    if (!idsActuales.has(idNew)) {
      return NextResponse.json(
        { error: `Id desconocido: ${idNew}` },
        { status: 400 },
      );
    }
  }

  // Validar que los EN_CURSO/FINALIZADO no cambian su posición.
  const itemsById = new Map(pcp.items.map((i) => [i.id, i]));
  for (let nuevoOrden = 0; nuevoOrden < ordenIds.length; nuevoOrden++) {
    const it = itemsById.get(ordenIds[nuevoOrden])!;
    if (it.estado !== "PENDIENTE" && it.orden !== nuevoOrden) {
      return NextResponse.json(
        { error: `Ítem ${it.estado.toLowerCase()} no puede cambiar de posición` },
        { status: 400 },
      );
    }
  }

  // Reasignamos orden y recomputamos schedule. Los ítems no PENDIENTE
  // conservan sus tiempos reales; los PENDIENTE reciben los nuevos teóricos.
  // El "cursor" arranca en el inicio del PCP y avanza:
  //   - Si el ítem actual ya está finalizado/en curso, usamos finTeorico
  //     existente o ahora (no recalculamos sus tiempos).
  //   - Si está pendiente, planificamos a partir del cursor.
  // Para simplificar, recalculamos schedule de todos los pendientes en
  // función del orden completo (los anteriores son fijos pero su duración
  // teórica original sigue valiendo para el encadenamiento).

  // Construimos el plan para `planificar`. Para los items no-PENDIENTE
  // usamos su finTeorico original para anclar el cursor; para los PENDIENTE,
  // calculamos.

  const planItems: ItemPlan[] = ordenIds.map((itemId, idx) => {
    const it = itemsById.get(itemId)!;
    return {
      index: idx,
      tipo: it.tipo,
      cantidadPiezas: it.cantidad,
      piezasPorHora: it.articulo.piezasPorHora,
      color: it.color,
      configPerchas: it.configPerchas,
      piezasPorPercha: it.piezasPorPercha,
      velocidadLavado: it.velocidadLavado,
    };
  });
  const schedule = planificar(planItems, pcp.inicio);

  // Persistir orden + tiempos teóricos. Solo tocamos `inicioTeorico` /
  // `finTeorico` en ítems PENDIENTE; los demás solo cambian `orden`.
  await prisma.$transaction(async (tx) => {
    // Necesitamos evitar el conflicto del unique (pcpId, orden) durante el
    // shuffle. Estrategia: primero seteamos orden a valores negativos
    // temporales, después al final.
    for (let idx = 0; idx < ordenIds.length; idx++) {
      await tx.item.update({
        where: { id: ordenIds[idx] },
        data: { orden: -1 - idx },
      });
    }
    for (let idx = 0; idx < ordenIds.length; idx++) {
      const it = itemsById.get(ordenIds[idx])!;
      const sch = schedule[idx];
      const data: { orden: number; inicioTeorico?: Date; finTeorico?: Date } = {
        orden: idx,
      };
      if (it.estado === "PENDIENTE") {
        data.inicioTeorico = sch.inicio;
        data.finTeorico = sch.fin;
      }
      await tx.item.update({ where: { id: ordenIds[idx] }, data });
    }
    // Marcar el PCP como reordenado manualmente.
    await tx.pcp.update({ where: { id }, data: { ordenManual: true } });
  });

  return NextResponse.json({ ok: true });
}
