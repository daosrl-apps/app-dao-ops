/**
 * PUT /api/ordenes/reordenar
 * Body: { ids: string[] }  // nuevo orden de TODAS las OTs PENDIENTE
 *
 * Reordena las OTs PENDIENTE (drag & drop). Re-encadena la cola en el orden
 * recibido anclando la primera en el inicio más temprano que ya tenían (la cola
 * conserva su punto de arranque), respetando el gap de 15 min entre OTs y +30
 * por cambio de color (PINTURA→PINTURA). Las OTs EN_CURSO / FINALIZADO no se
 * tocan. Solo SUPERVISOR / ADMIN.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { registrarAuditoria } from "@/lib/auditoria";
import { reencadenar, type ItemReencadenable } from "@/lib/schedule";

const Body = z.object({ ids: z.array(z.string().min(1)).min(1) });

export async function PUT(req: NextRequest) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Falta la lista de ids" }, { status: 400 });
  }
  const { ids } = parsed.data;

  const pendientes = await prisma.ordenTrabajo.findMany({
    where: { estado: "PENDIENTE" },
    select: {
      id: true,
      numero: true,
      tipo: true,
      color: true,
      inicioProgramado: true,
      inicioTeorico: true,
      finTeorico: true,
    },
  });

  // El orden recibido debe ser exactamente una permutación de las PENDIENTE.
  const setActual = new Set(pendientes.map((p) => p.id));
  const setNuevo = new Set(ids);
  if (setActual.size !== setNuevo.size || ids.some((id) => !setActual.has(id))) {
    return NextResponse.json(
      { error: "La lista de ids no coincide con las OTs pendientes actuales." },
      { status: 409 },
    );
  }

  const byId = new Map(pendientes.map((p) => [p.id, p]));
  const ordenadas = ids.map((id) => byId.get(id)!);

  // Ancla: el inicio programado más temprano que ya tenían (conserva el arranque).
  const anclaMs = Math.min(...pendientes.map((p) => p.inicioProgramado.getTime()));
  const ancla = new Date(anclaMs);

  const items: ItemReencadenable[] = ordenadas.map((o) => ({
    tipo: o.tipo,
    color: o.color,
    duracionSeg: Math.round((o.finTeorico.getTime() - o.inicioTeorico.getTime()) / 1000),
  }));
  const plan = reencadenar(items, ancla);

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < ordenadas.length; i++) {
      const o = ordenadas[i];
      const { inicio, fin } = plan[i];
      await tx.ordenTrabajo.update({
        where: { id: o.id },
        data: { inicioProgramado: inicio, inicioTeorico: inicio, finTeorico: fin },
      });
    }
    await registrarAuditoria(tx, {
      tipo: "REORDENAR",
      entidad: "OT",
      resumen: `Reordenó ${ordenadas.length} OTs pendientes`,
      detalle: { ordenNuevo: ordenadas.map((o) => o.numero) },
      usuario: { id: auth.claims.sub, name: auth.claims.name },
    });
  });

  return NextResponse.json({ ok: true });
}
