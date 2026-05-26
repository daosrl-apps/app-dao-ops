/**
 * Timeline de planificación: muestra los PCPs del día (por defecto hoy) con
 * todos sus ítems encadenados. Compara plan teórico vs ejecución real.
 *
 * Las demoras se reflejan automáticamente porque al haber `inicioReal` /
 * `finReal` los valores se muestran tal cual están en DB; la UI sólo dibuja.
 * El recálculo aguas abajo (correr los siguientes ítems) se hace al hacer
 * cambios en el PCP (otro flujo).
 */
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

interface TimelinePageProps {
  searchParams: Promise<{ fecha?: string }>;
}

export default async function TimelinePage({ searchParams }: TimelinePageProps) {
  await requireSession(["SUPERVISOR", "ADMIN"]);
  const { fecha } = await searchParams;
  const dia = fecha ? new Date(fecha) : new Date();
  const inicio = startOfDay(dia);
  const fin = endOfDay(dia);

  const pcps = await prisma.pcp.findMany({
    where: { inicio: { gte: inicio, lte: fin } },
    orderBy: { inicio: "asc" },
    include: {
      items: {
        orderBy: { orden: "asc" },
        include: { articulo: { include: { cliente: true } } },
      },
    },
  });

  const fechaStr = dia.toISOString().slice(0, 10);
  const ayer = addDays(dia, -1).toISOString().slice(0, 10);
  const maniana = addDays(dia, 1).toISOString().slice(0, 10);

  return (
    <section className="mx-auto w-full max-w-5xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-slate-800">
          Timeline · {dia.toLocaleDateString("es-AR", { dateStyle: "full" })}
        </h1>
        <div className="flex gap-2">
          <Link
            href={`?fecha=${ayer}`}
            className="h-10 inline-flex items-center px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
          >
            ← Anterior
          </Link>
          <Link
            href="?"
            className="h-10 inline-flex items-center px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
          >
            Hoy
          </Link>
          <Link
            href={`?fecha=${maniana}`}
            className="h-10 inline-flex items-center px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
          >
            Siguiente →
          </Link>
        </div>
      </div>

      {pcps.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-8 text-center">
          <p className="text-slate-500">No hay PCPs planificados para {fechaStr}.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pcps.map((pcp) => (
            <PcpTimeline key={pcp.id} pcp={pcp} />
          ))}
        </div>
      )}
    </section>
  );
}

function PcpTimeline({
  pcp,
}: {
  pcp: {
    id: string;
    inicio: Date;
    items: {
      id: string;
      orden: number;
      color: string;
      cantidad: number;
      estado: string;
      inicioTeorico: Date;
      finTeorico: Date;
      inicioReal: Date | null;
      finReal: Date | null;
      articulo: { codigo: string; descripcion: string | null; cliente: { nombre: string } };
    }[];
  };
}) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm uppercase tracking-wide text-slate-500">
          PCP · inicio {pcp.inicio.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
        </p>
        <Link href={`/dashboard/pcp/${pcp.id}`} className="text-sm text-[#1627b1] hover:underline">
          Ver detalle →
        </Link>
      </div>
      <ol className="space-y-2">
        {pcp.items.map((it) => (
          <ItemRow key={it.id} item={it} />
        ))}
      </ol>
    </div>
  );
}

function ItemRow({
  item,
}: {
  item: {
    orden: number;
    color: string;
    cantidad: number;
    estado: string;
    inicioTeorico: Date;
    finTeorico: Date;
    inicioReal: Date | null;
    finReal: Date | null;
    articulo: { codigo: string; descripcion: string | null; cliente: { nombre: string } };
  };
}) {
  const desviacionMin =
    item.finReal && item.finTeorico
      ? Math.round((item.finReal.getTime() - item.finTeorico.getTime()) / 60000)
      : null;
  const titulo = item.articulo.descripcion?.trim() || item.articulo.codigo;

  return (
    <li className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-3 items-center rounded-xl bg-slate-50 border border-slate-200 p-3">
      <div>
        <p className="text-xs uppercase tracking-wider text-slate-500">
          #{item.orden + 1} · {item.articulo.cliente.nombre}
        </p>
        <p className="text-lg font-black tracking-tight text-slate-900">{titulo}</p>
        <p className="text-sm font-medium text-slate-600">
          {item.cantidad} pzs · {item.color}
        </p>
      </div>
      <div className="text-sm">
        <p className="text-slate-500">
          Plan:{" "}
          <b>
            {formatHora(item.inicioTeorico)} → {formatHora(item.finTeorico)}
          </b>
        </p>
        <p className="text-slate-700">
          Real:{" "}
          <b>
            {item.inicioReal ? formatHora(item.inicioReal) : "—"} →{" "}
            {item.finReal ? formatHora(item.finReal) : "—"}
          </b>
        </p>
      </div>
      <div className="text-right">
        <EstadoBadge estado={item.estado} />
        {desviacionMin !== null && (
          <p
            className={
              "text-xs mt-1 " +
              (desviacionMin > 0 ? "text-red-700" : desviacionMin < 0 ? "text-emerald-700" : "text-slate-500")
            }
          >
            {desviacionMin > 0 ? `+${desviacionMin}` : desviacionMin} min
          </p>
        )}
      </div>
    </li>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    PENDIENTE: { bg: "bg-amber-100", text: "text-amber-800", label: "Pendiente" },
    EN_CURSO: { bg: "bg-blue-100", text: "text-blue-800", label: "En curso" },
    FINALIZADO: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Finalizado" },
  };
  const c = cfg[estado] ?? { bg: "bg-slate-200", text: "text-slate-600", label: estado };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

function formatHora(d: Date) {
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
