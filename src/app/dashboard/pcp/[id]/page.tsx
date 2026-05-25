import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function PcpDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
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

  return (
    <section className="mx-auto w-full max-w-5xl p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">
        PCP del{" "}
        {pcp.inicio.toLocaleDateString("es-AR", {
          weekday: "long",
          day: "2-digit",
          month: "long",
        })}
      </h1>
      <p className="text-slate-600 mb-6">
        Inicio teórico:{" "}
        <b>
          {pcp.inicio.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </b>{" "}
        · creado por {pcp.creadoPor.name} · {pcp.items.length} ítem(s)
      </p>

      <ol className="space-y-3">
        {pcp.items.map((it, idx) => (
          <li
            key={it.id}
            className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-lg font-semibold text-slate-800">
                  #{idx + 1} · {it.articulo.cliente.nombre} · {it.articulo.codigo}
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  {it.cantidad} pzs · {it.color}
                  {it.incluyeLavado &&
                    ` · lavado ${it.piezasPorPercha}/percha @ ${it.velocidadLavado} m/s`}
                </p>
              </div>
              <p className="text-sm text-slate-600">
                <b>
                  {it.inicioTeorico.toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </b>{" "}
                →{" "}
                <b>
                  {it.finTeorico.toLocaleTimeString("es-AR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </b>
              </p>
            </div>
            <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
              Estado: {it.estado}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
