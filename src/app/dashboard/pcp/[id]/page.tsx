import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";
import { PcpDetailClient, type ItemView } from "./pcp-detail-client";

export const dynamic = "force-dynamic";

export default async function PcpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const claims = await requireSession();
  const { id } = await params;

  const pcp = await prisma.pcp.findUnique({
    where: { id },
    include: {
      creadoPor: { select: { name: true } },
      items: {
        orderBy: { orden: "asc" },
        include: { articulo: { include: { cliente: true } } },
      },
    },
  });

  if (!pcp) notFound();

  const items: ItemView[] = pcp.items.map((it) => ({
    id: it.id,
    orden: it.orden,
    tipo: it.tipo,
    estado: it.estado,
    color: it.color,
    cantidad: it.cantidad,
    piezasPorPercha: it.piezasPorPercha,
    velocidadLavado: it.velocidadLavado,
    inicioTeorico: it.inicioTeorico.toISOString(),
    finTeorico: it.finTeorico.toISOString(),
    inicioReal: it.inicioReal?.toISOString() ?? null,
    finReal: it.finReal?.toISOString() ?? null,
    articulo: {
      codigo: it.articulo.codigo,
      descripcion: it.articulo.descripcion,
      cliente: { nombre: it.articulo.cliente.nombre },
    },
  }));

  return (
    <PcpDetailClient
      pcpId={pcp.id}
      inicio={pcp.inicio.toISOString()}
      creadoPor={pcp.creadoPor.name}
      ordenManual={pcp.ordenManual}
      items={items}
      puedeEditar={claims.role === "SUPERVISOR" || claims.role === "ADMIN"}
    />
  );
}
