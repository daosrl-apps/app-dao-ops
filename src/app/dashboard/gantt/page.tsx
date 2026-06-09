import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";
import { GanttClient, type GanttOT } from "./gantt-client";

export const dynamic = "force-dynamic";

export default async function GanttPage() {
  await requireSession(["SUPERVISOR", "ADMIN", "OPERARIO"]);

  const ordenes = await prisma.ordenTrabajo.findMany({
    take: 200,
    where: { estado: { not: "CANCELADO" } },
    orderBy: { inicioTeorico: "asc" },
    include: { articulo: { select: { codigo: true, descripcion: true } } },
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
