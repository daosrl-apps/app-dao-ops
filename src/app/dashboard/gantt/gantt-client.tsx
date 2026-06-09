"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Droplets, Paintbrush, Smartphone, ZoomIn, ZoomOut } from "lucide-react";
import { formatFecha, formatFechaHora } from "@/lib/utils";

export interface GanttOT {
  id: string;
  numero: number;
  estado: "PENDIENTE" | "EN_CURSO" | "FINALIZADO" | "CANCELADO";
  tipo: "LAVADO" | "PINTURA";
  color: string;
  titulo: string;
  /** Proyectado: inicio/fin teóricos (el plan). */
  inicio: string; // ISO
  fin: string; // ISO
  /** Real: se llenan al iniciar/finalizar la OT. null si todavía no pasó. */
  inicioReal: string | null;
  finReal: string | null;
}

const ROW_H = 52;
const LABEL_W = 240;
const PX_MIN = 16;
const PX_MAX = 320;
const PX_DEFAULT = 64;

/** Span real de una OT en ms, o null si no tiene inicio real todavía. */
function spanReal(o: GanttOT, nowMs: number | null): { start: number; end: number } | null {
  if (!o.inicioReal) return null;
  const start = new Date(o.inicioReal).getTime();
  let end: number;
  if (o.finReal) {
    end = new Date(o.finReal).getTime();
  } else if (o.estado === "EN_CURSO" && nowMs != null) {
    end = nowMs; // en curso: crece hasta ahora
  } else {
    end = start; // sin fin y no en curso: lo dibujamos como un punto
  }
  return { start, end: Math.max(end, start) };
}

export function GanttClient({ items }: { items: GanttOT[] }) {
  const router = useRouter();
  const [px, setPx] = React.useState(PX_DEFAULT);
  const [verProyectado, setVerProyectado] = React.useState(true);
  const [verReal, setVerReal] = React.useState(true);

  // `now` arranca null para no romper la hidratación (server y cliente coinciden);
  // tras montar lo seteamos y, si hay OTs en curso, lo refrescamos cada minuto.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    const hayEnCurso = items.some((o) => o.estado === "EN_CURSO" && o.inicioReal && !o.finReal);
    if (!hayEnCurso) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [items]);

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 text-slate-500">
        No hay órdenes para mostrar.
      </div>
    );
  }

  const reales = items.map((o) => spanReal(o, now));

  // Rango temporal: unión de los segmentos visibles según el filtro.
  const puntos: number[] = [];
  items.forEach((o, i) => {
    if (verProyectado) {
      puntos.push(new Date(o.inicio).getTime(), new Date(o.fin).getTime());
    }
    if (verReal && reales[i]) {
      puntos.push(reales[i]!.start, reales[i]!.end);
    }
  });

  const zoom = (factor: number) =>
    setPx((p) => Math.min(PX_MAX, Math.max(PX_MIN, Math.round(p * factor))));

  const toolbar = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <FiltroToggle activo={verProyectado} onClick={() => setVerProyectado((v) => !v)}>
          <span className="inline-block h-3 w-5 rounded-sm bg-emerald-500" />
          Proyectado
        </FiltroToggle>
        <FiltroToggle activo={verReal} onClick={() => setVerReal((v) => !v)}>
          <span className="inline-block h-3 w-5 rounded-sm border-2 border-dotted border-slate-700" />
          Real
        </FiltroToggle>
      </div>
      <div className="flex items-center gap-2">
        <p className="flex items-center gap-2 text-sm text-slate-500 sm:hidden">
          <Smartphone className="h-4 w-4" /> Girá el celular.
        </p>
        <span className="text-sm text-slate-500">Zoom</span>
        <button
          onClick={() => zoom(1 / 1.4)}
          className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-100"
          aria-label="Alejar"
        >
          <ZoomOut className="h-4 w-4" />
        </button>
        <button
          onClick={() => zoom(1.4)}
          className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-100"
          aria-label="Acercar"
        >
          <ZoomIn className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  if (puntos.length === 0) {
    return (
      <>
        {toolbar}
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 text-slate-500">
          {verReal && !verProyectado
            ? "Todavía no hay tiempos reales para mostrar."
            : "Seleccioná al menos una vista (Proyectado o Real)."}
        </div>
      </>
    );
  }

  const min = piso(new Date(Math.min(...puntos)));
  const max = techo(new Date(Math.max(...puntos)));
  const totalHoras = Math.max(1, Math.round((max.getTime() - min.getTime()) / 3_600_000));
  const trackW = totalHoras * px;

  const xDe = (ms: number) => ((ms - min.getTime()) / 3_600_000) * px;

  // Ticks por hora; etiqueta de hora cada `stepH` para que no se amontonen.
  const stepH = Math.max(1, Math.ceil(46 / px));
  const ticks = Array.from({ length: totalHoras + 1 }, (_, i) => {
    const d = new Date(min.getTime() + i * 3_600_000);
    return { x: i * px, d, label: i % stepH === 0 };
  });

  // Segmentos de día para la fila de fecha (arriba de la hora).
  const dias: { x: number; w: number; label: string }[] = [];
  let d0 = inicioDia(min);
  while (d0.getTime() < max.getTime()) {
    const next = new Date(d0.getTime());
    next.setDate(next.getDate() + 1);
    const segX = Math.max(0, xDe(d0.getTime()));
    const segEnd = Math.min(trackW, xDe(next.getTime()));
    if (segEnd > segX) dias.push({ x: segX, w: segEnd - segX, label: fechaLarga(d0) });
    d0 = next;
  }

  return (
    <>
      {toolbar}

      <div className="overflow-auto max-h-[75vh] rounded-2xl bg-white shadow-sm border border-slate-200">
        <div style={{ width: LABEL_W + trackW }}>
          {/* Encabezado: fila de fecha + fila de hora (sticky arriba) */}
          <div className="sticky top-0 z-30 bg-slate-50">
            {/* Fila de fecha */}
            <div className="flex border-b border-slate-200">
              <div
                className="sticky left-0 z-10 flex items-center bg-slate-50 border-r border-slate-200 px-3 text-xs font-bold uppercase tracking-wide text-slate-500"
                style={{ width: LABEL_W, minWidth: LABEL_W, height: 28 }}
              >
                Orden de trabajo
              </div>
              <div className="relative" style={{ width: trackW, height: 28 }}>
                {dias.map((s, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-slate-200 flex items-center"
                    style={{ left: s.x, width: s.w }}
                  >
                    <span className="px-2 text-xs font-bold text-slate-600 whitespace-nowrap">
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {/* Fila de hora */}
            <div className="flex border-b border-slate-200">
              <div
                className="sticky left-0 z-10 bg-slate-50 border-r border-slate-200"
                style={{ width: LABEL_W, minWidth: LABEL_W, height: 26 }}
              />
              <div className="relative" style={{ width: trackW, height: 26 }}>
                {ticks.map((t, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-slate-200"
                    style={{ left: t.x }}
                  >
                    {t.label && (
                      <span className="absolute left-1 top-1 text-[11px] font-medium text-slate-500 whitespace-nowrap">
                        {pad(t.d.getHours())}:00
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Filas de OTs */}
          {items.map((o, idx) => {
            const lavado = o.tipo === "LAVADO";
            const rs = reales[idx];
            const proyLeft = xDe(new Date(o.inicio).getTime());
            const proyWidth = Math.max(4, xDe(new Date(o.fin).getTime()) - proyLeft);
            return (
              <div
                key={o.id}
                className={"flex items-stretch " + (idx % 2 ? "bg-white" : "bg-slate-50/40")}
                style={{ minHeight: ROW_H }}
              >
                <button
                  onClick={() => router.push(`/dashboard/ordenes/${o.id}`)}
                  className="sticky left-0 z-10 flex items-center gap-2 border-r border-b border-slate-200 bg-inherit px-3 py-2 text-left text-sm font-bold text-slate-800 hover:text-[#1627b1]"
                  style={{ width: LABEL_W, minWidth: LABEL_W }}
                >
                  {lavado ? (
                    <Droplets className="h-4 w-4 shrink-0 text-sky-600" />
                  ) : (
                    <Paintbrush className="h-4 w-4 shrink-0 text-emerald-600" />
                  )}
                  <span className="whitespace-normal break-words leading-tight">
                    #{o.numero} {o.titulo}
                  </span>
                </button>
                <div className="relative border-b border-slate-100" style={{ width: trackW }}>
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-l border-slate-100"
                      style={{ left: t.x }}
                    />
                  ))}

                  {/* Proyectado: barra sólida */}
                  {verProyectado && (
                    <button
                      onClick={() => router.push(`/dashboard/ordenes/${o.id}`)}
                      className={
                        "absolute top-1/2 -translate-y-1/2 z-10 rounded-md shadow-sm " +
                        (lavado ? "bg-sky-500 hover:bg-sky-600" : "bg-emerald-500 hover:bg-emerald-600")
                      }
                      style={{ left: proyLeft, width: proyWidth, height: 16 }}
                      title={`#${o.numero} ${o.titulo} · Proyectado: ${rango(o.inicio, o.fin)}`}
                      aria-label={`OT ${o.numero} proyectado`}
                    />
                  )}

                  {/* Real: barra con borde punteado, superpuesta */}
                  {verReal && rs && (
                    <button
                      onClick={() => router.push(`/dashboard/ordenes/${o.id}`)}
                      className="absolute top-1/2 -translate-y-1/2 z-20 rounded-md border-2 border-dotted border-slate-700 bg-white/10"
                      style={{
                        left: xDe(rs.start),
                        width: Math.max(4, xDe(rs.end) - xDe(rs.start)),
                        height: 26,
                      }}
                      title={`#${o.numero} ${o.titulo} · Real: ${rangoMs(rs.start, rs.end)}`}
                      aria-label={`OT ${o.numero} real`}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <Leyenda className="bg-sky-500" label="Lavado" />
        <Leyenda className="bg-emerald-500" label="Pintura" />
        <span className="text-slate-300">|</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm bg-emerald-500" />
          Proyectado (sólido)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm border-2 border-dotted border-slate-700" />
          Real (línea de puntos)
        </span>
      </div>
    </>
  );
}

function FiltroToggle({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors " +
        (activo
          ? "border-[#1627b1] bg-[#1627b1]/5 text-slate-800"
          : "border-slate-300 bg-white text-slate-400 hover:bg-slate-50")
      }
    >
      {children}
    </button>
  );
}

function Leyenda({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={"inline-block h-3 w-3 rounded-sm " + className} />
      {label}
    </span>
  );
}

function piso(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}
function techo(d: Date): Date {
  const x = new Date(d);
  if (x.getMinutes() !== 0 || x.getSeconds() !== 0 || x.getMilliseconds() !== 0) {
    x.setHours(x.getHours() + 1, 0, 0, 0);
  }
  return x;
}
function inicioDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fechaLarga(d: Date): string {
  return formatFecha(d);
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function rango(inicioISO: string, finISO: string): string {
  return `${formatFechaHora(inicioISO)} → ${formatFechaHora(finISO)}`;
}
function rangoMs(inicioMs: number, finMs: number): string {
  return `${formatFechaHora(new Date(inicioMs))} → ${formatFechaHora(new Date(finMs))}`;
}
