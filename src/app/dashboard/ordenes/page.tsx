import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";
import { OrdenesListClient, type OrdenView } from "./ordenes-list-client";

export const dynamic = "force-dynamic";

export default async function OrdenesListPage() {
  const claims = await requireSession(["SUPERVISOR", "ADMIN", "OPERARIO"]);

  // Activas (pendientes/en curso) sin límite para que la cola de trabajo nunca
  // se trunque; historial (finalizadas/canceladas) acotado a las 200 más
  // recientes — el cliente las agrupa por día y las muestra colapsadas.
  const [activas, viejas] = await Promise.all([
    prisma.ordenTrabajo.findMany({
      where: { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
      orderBy: { inicioTeorico: "asc" },
      include: {
        articulo: { include: { cliente: true } },
        creadoPor: { select: { name: true } },
      },
    }),
    prisma.ordenTrabajo.findMany({
      where: { estado: { in: ["FINALIZADO", "CANCELADO"] } },
      take: 200,
      orderBy: { inicioTeorico: "desc" },
      include: {
        articulo: { include: { cliente: true } },
        creadoPor: { select: { name: true } },
      },
    }),
  ]);
  const ordenes = [...activas, ...viejas];

  const items: OrdenView[] = ordenes.map((o) => ({
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    tipo: o.tipo,
    color: o.color,
    cantidad: o.cantidad,
    cantidadCompletada: o.cantidadCompletada,
    inicioTeorico: o.inicioTeorico.toISOString(),
    finTeorico: o.finTeorico.toISOString(),
    inicioReal: o.inicioReal?.toISOString() ?? null,
    finReal: o.finReal?.toISOString() ?? null,
    creadoPor: o.creadoPor.name,
    articulo: {
      codigo: o.articulo.codigo,
      descripcion: o.articulo.descripcion,
      cliente: o.articulo.cliente.nombre,
    },
    esContinuacion: o.ordenPadreId !== null,
  }));

  return (
    <section className="mx-auto w-full max-w-5xl p-6">
      <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
        <h1 className="text-3xl font-bold text-slate-800">Órdenes de trabajo</h1>
        <Link
          href="/dashboard/ordenes/nueva"
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#1627b1] px-5 text-white font-medium hover:bg-[#1627b1]/90"
        >
          <Plus className="h-5 w-5" /> Nueva
        </Link>
      </div>

      <OrdenesListClient
        items={items}
        esAdmin={claims.role === "ADMIN"}
        puedeReordenar={claims.role !== "OPERARIO"}
        puedeEditar={claims.role !== "OPERARIO"}
      />
    </section>
  );
}
