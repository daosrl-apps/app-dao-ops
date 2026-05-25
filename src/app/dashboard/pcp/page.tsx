import Link from "next/link";
import { Plus, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function PcpListPage() {
  await requireSession(["SUPERVISOR", "ADMIN", "OPERARIO"]);

  const pcps = await prisma.pcp.findMany({
    take: 50,
    orderBy: { inicio: "desc" },
    include: {
      _count: { select: { items: true } },
      creadoPor: { select: { name: true } },
    },
  });

  return (
    <section className="mx-auto w-full max-w-5xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-slate-800">Órdenes de trabajo</h1>
        <Link
          href="/dashboard/pcp/nuevo"
          className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#1627b1] px-5 text-white font-medium hover:bg-[#1627b1]/90"
        >
          <Plus className="h-5 w-5" /> Nueva
        </Link>
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        {pcps.length === 0 ? (
          <p className="p-6 text-slate-500">Todavía no hay órdenes cargadas.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {pcps.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/dashboard/pcp/${p.id}`}
                  className="flex items-center justify-between p-5 hover:bg-slate-50"
                >
                  <div className="flex items-center gap-4">
                    <EstadoBadge estado={p.estado} />
                    <div>
                      <p className="text-lg font-semibold text-slate-800">
                        {p.inicio.toLocaleString("es-AR", {
                          dateStyle: "long",
                          timeStyle: "short",
                        })}
                      </p>
                      <p className="text-sm text-slate-600">
                        {p._count.items} ítem(s) · creado por {p.creadoPor.name}
                      </p>
                    </div>
                  </div>
                  <span className="text-slate-400">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "EN_CURSO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
        <Clock className="h-4 w-4" /> En curso
      </span>
    );
  }
  if (estado === "FINALIZADO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
        <CheckCircle2 className="h-4 w-4" /> Finalizado
      </span>
    );
  }
  if (estado === "CANCELADO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-sm font-medium text-slate-600">
        Cancelado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
      <AlertCircle className="h-4 w-4" /> Pendiente
    </span>
  );
}
