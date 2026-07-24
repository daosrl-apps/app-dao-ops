import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";
import { GanttClient, type GanttOT } from "./gantt-client";

export const dynamic = "force-dynamic";

export default async function GanttPage() {
  await requireSession(["SUPERVISOR", "ADMIN", "OPERARIO"]);

  // Ventana de relevancia: SIEMPRE las activas (PENDIENTE/EN_CURSO) más las
  // finalizadas de los últimos 14 días. Sin este filtro, `take` + orderBy asc
  // devolvía las 200 OTs MÁS VIEJAS: las FINALIZADO se acumulan indefinidamente
  // (conservan su inicioTeorico original), copan los cupos y expulsan a las
  // órdenes actuales, dejando el Gantt "clavado" en fechas viejas.
  const ahora = new Date();
  const desde = new Date(ahora.getTime() - 14 * 24 * 60 * 60 * 1000);

  const ordenes = await prisma.ordenTrabajo.findMany({
    take: 500,
    where: {
      estado: { not: "CANCELADO" },
      OR: [
        { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
        { finReal: { gte: desde } },
        { finTeorico: { gte: desde } },
      ],
    },
    orderBy: { inicioTeorico: "asc" },
    include: {
      articulo: { select: { codigo: true, descripcion: true } },
      pausas: { where: { fin: { not: null } }, select: { inicio: true, fin: true } },
    },
  });

  const items: GanttOT[] = ordenes.map((o) => ({
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    tipo: o.tipo,
    color: o.color,
    titulo: o.articulo.descripcion?.trim() || o.articulo.codigo,
    // Proyectado: plan teórico (inicio/fin teóricos).
    inicio: o.inicioTeorico.toISOString(),
    fin: o.finTeorico.toISOString(),
    // Real: se llenan cuando el operario inicia/finaliza la OT.
    inicioReal: o.inicioReal?.toISOString() ?? null,
    finReal: o.finReal?.toISOString() ?? null,
    // Pausas cerradas (segmentos grises sobre la barra real).
    pausas: o.pausas.map((p) => ({ inicio: p.inicio.toISOString(), fin: p.fin!.toISOString() })),
  }));

  return (
    <section className="mx-auto w-full max-w-[1600px] p-4 sm:p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Gantt</h1>
      <p className="text-slate-600 mb-4">
        Órdenes de trabajo sobre una regla de tiempo. Girá el celular para ver mejor el diagrama.
      </p>
      <GanttClient items={items} />
    </section>
  );
}
