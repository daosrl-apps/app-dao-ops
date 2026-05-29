import { notFound } from "next/navigation";
import Link from "next/link";
import { Droplets, Paintbrush } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

export default async function OrdenDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSession();
  const { id } = await params;

  const ot = await prisma.ordenTrabajo.findUnique({
    where: { id },
    include: {
      articulo: { include: { cliente: true } },
      creadoPor: { select: { name: true } },
      pausas: { orderBy: { inicio: "asc" } },
      ordenPadre: { select: { id: true, numero: true } },
      continuaciones: { select: { id: true, numero: true, cantidad: true } },
    },
  });
  if (!ot) notFound();

  const titulo = ot.articulo.descripcion?.trim() || ot.articulo.codigo;
  const isLavado = ot.tipo === "LAVADO";

  return (
    <section className="mx-auto w-full max-w-3xl p-6">
      <div className="mb-4">
        <Link href="/dashboard/ordenes" className="text-sm text-slate-600 hover:text-slate-900">
          ← Volver al listado
        </Link>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold uppercase tracking-wide " +
            (isLavado ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800")
          }
        >
          {isLavado ? <Droplets className="h-4 w-4" /> : <Paintbrush className="h-4 w-4" />}
          {isLavado ? "Lavado" : "Pintura"}
        </span>
        <EstadoBadge estado={ot.estado} />
        <span className="text-sm uppercase tracking-wider text-slate-500">
          {ot.articulo.cliente.nombre}
        </span>
      </div>

      <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-1">
        #{ot.numero} · {titulo}
      </h1>
      <p className="text-lg text-slate-700 font-semibold mb-6">
        {ot.cantidad} piezas
        {ot.tipo === "PINTURA" && ` · ${ot.color}`}
        {ot.tipo === "LAVADO" && ot.piezasPorPercha != null && ot.velocidadLavado != null && (
          <> · {ot.piezasPorPercha}/percha · {ot.velocidadLavado} m/s</>
        )}
      </p>

      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 mb-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-4">Tiempos</h2>
        <div className="space-y-4">
          <TiempoFila label="Inicio" teorico={ot.inicioTeorico} real={ot.inicioReal} />
          <TiempoFila label="Fin" teorico={ot.finTeorico} real={ot.finReal} />
          <div className="flex items-baseline justify-between gap-3 border-t border-slate-100 pt-3">
            <span className="text-base text-slate-500">Inicio programado</span>
            <span className="text-lg font-semibold tabular-nums">{formatDT(ot.inicioProgramado)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-base text-slate-500">Creado por</span>
            <span className="text-lg font-semibold">{ot.creadoPor.name}</span>
          </div>
        </div>
      </div>

      {(ot.ordenPadre || ot.continuaciones.length > 0) && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 mb-4">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">
            Continuaciones
          </h2>
          {ot.ordenPadre && (
            <p className="text-sm">
              Esta OT continúa la{" "}
              <Link href={`/dashboard/ordenes/${ot.ordenPadre.id}`} className="text-[#1627b1] hover:underline font-medium">
                #{ot.ordenPadre.numero}
              </Link>
            </p>
          )}
          {ot.continuaciones.length > 0 && (
            <p className="text-sm">
              Esta OT continúa en:{" "}
              {ot.continuaciones.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <Link href={`/dashboard/ordenes/${c.id}`} className="text-[#1627b1] hover:underline font-medium">
                    #{c.numero}
                  </Link>{" "}
                  ({c.cantidad} pzs)
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      {ot.pausas.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 mb-3">Pausas</h2>
          <ul className="space-y-2 text-sm">
            {ot.pausas.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="font-medium text-slate-800">{p.motivo}</span>
                <span className="text-slate-500">
                  {formatHora(p.inicio)} → {p.fin ? formatHora(p.fin) : "abierta"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const cfg: Record<string, { bg: string; text: string; label: string }> = {
    PENDIENTE: { bg: "bg-amber-100", text: "text-amber-800", label: "Pendiente" },
    EN_CURSO: { bg: "bg-blue-100", text: "text-blue-800", label: "En curso" },
    FINALIZADO: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Finalizado" },
    CANCELADO: { bg: "bg-slate-200", text: "text-slate-600", label: "Cancelado" },
  };
  const c = cfg[estado] ?? cfg.PENDIENTE;
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
}

/**
 * Fila de tiempo: muestra el teórico y, si hay real, el horario real con un
 * delta +/- coloreado (rojo si se atrasó, verde si se adelantó).
 */
function TiempoFila({
  label,
  teorico,
  real,
}: {
  label: string;
  teorico: Date;
  real: Date | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-base text-slate-500">{label}</span>
      <div className="text-right">
        <div className="text-xl font-bold tabular-nums text-slate-900">
          {real ? formatDT(real) : formatDT(teorico)}
          {real && <DeltaBadge teorico={teorico} real={real} />}
        </div>
        {real && (
          <div className="text-sm text-slate-400 tabular-nums">teórico {formatDT(teorico)}</div>
        )}
      </div>
    </div>
  );
}

function DeltaBadge({ teorico, real }: { teorico: Date; real: Date }) {
  const deltaMin = Math.round((real.getTime() - teorico.getTime()) / 60000);
  if (deltaMin === 0) {
    return <span className="ml-2 text-base font-bold text-slate-400">±0m</span>;
  }
  const atrasado = deltaMin > 0;
  const signo = atrasado ? "+" : "−";
  return (
    <span
      className={"ml-2 text-base font-bold " + (atrasado ? "text-red-600" : "text-emerald-600")}
    >
      {signo}
      {formatDelta(Math.abs(deltaMin))}
    </span>
  );
}

function formatDelta(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function formatDT(d: Date) {
  return d.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}
function formatHora(d: Date) {
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
