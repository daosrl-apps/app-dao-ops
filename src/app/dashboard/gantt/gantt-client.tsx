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
  /** Pausas cerradas (segmentos grises sobre la barra real). */
  pausas: { inicio: string; fin: string }[];
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

const HORA_MS = 3_600_000;
const VENTANA_DEFAULT_MS = 48 * HORA_MS;

export function GanttClient({ items }: { items: GanttOT[] }) {
  const router = useRouter();
  const [px, setPx] = React.useState(PX_DEFAULT);
  const [verProyectado, setVerProyectado] = React.useState(true);
  const [verReal, setVerReal] = React.useState(true);
  // Ventana visible (sub-rango del total). `null` hasta que el efecto de montaje
  // la inicializa en "las últimas 48 h".
  const [view, setView] = React.useState<{ start: number; end: number } | null>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  // `now` arranca null para no romper la hidratación (server y cliente coinciden);
  // tras montar lo seteamos y, si hay OTs en curso, lo refrescamos cada minuto.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
    // Tickea cada minuto para mantener la línea de "ahora" (y las barras en
    // curso) actualizadas.
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [items]);

  const reales = items.map((o) => spanReal(o, now));

  // Extensión total: unión de los segmentos visibles según el filtro.
  const puntos: number[] = [];
  items.forEach((o, i) => {
    if (verProyectado) {
      puntos.push(new Date(o.inicio).getTime(), new Date(o.fin).getTime());
    }
    if (verReal && reales[i]) {
      puntos.push(reales[i]!.start, reales[i]!.end);
    }
  });
  const hayDatos = puntos.length > 0;
  const fullMinMs = hayDatos ? Math.min(...puntos) : 0;
  const fullMaxMs = hayDatos ? Math.max(...puntos) : 0;

  // Inicializa la ventana a las últimas 48 h la primera vez que hay datos.
  React.useEffect(() => {
    if (!hayDatos) return;
    setView((cur) => cur ?? ventanaUltimas(fullMinMs, fullMaxMs, Date.now(), VENTANA_DEFAULT_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayDatos, fullMinMs, fullMaxMs]);

  // Al cambiar la ventana, reseteamos el scroll horizontal al inicio.
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [view?.start, view?.end]);

  const zoom = (factor: number) =>
    setPx((p) => Math.min(PX_MAX, Math.max(PX_MIN, Math.round(p * factor))));

  // Presets de ventana: últimas N horas terminando en "ahora" (o en el fin de
  // los datos si "ahora" cae después). "Todo" muestra la extensión completa.
  const aplicarVentana = (widthMs: number) => {
    if (!hayDatos) return;
    const span = fullMaxMs - fullMinMs;
    const w = Math.min(widthMs, span);
    const end = Math.min(now ?? fullMaxMs, fullMaxMs);
    setView(clampVentana(end - w, end, fullMinMs, fullMaxMs));
  };
  const verTodo = () => hayDatos && setView({ start: fullMinMs, end: fullMaxMs });

  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 text-slate-500">
        No hay órdenes para mostrar.
      </div>
    );
  }

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

  if (!hayDatos) {
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

  // Ventana efectiva (antes de que el efecto inicialice `view`, usamos todo).
  const winStartMs = view ? view.start : fullMinMs;
  const winEndMs = view ? view.end : fullMaxMs;
  const min = piso(new Date(winStartMs));
  const max = techo(new Date(winEndMs));
  const totalHoras = Math.max(1, Math.round((max.getTime() - min.getTime()) / HORA_MS));
  const trackW = totalHoras * px;

  const xDe = (ms: number) => ((ms - min.getTime()) / HORA_MS) * px;

  // Solo las OTs que intersectan la ventana visible.
  const winA = min.getTime();
  const winB = max.getTime();
  const filas = items
    .map((o, idx) => ({ o, idx }))
    .filter(({ o, idx }) => {
      const okProy =
        verProyectado &&
        new Date(o.inicio).getTime() < winB &&
        new Date(o.fin).getTime() > winA;
      const rs = reales[idx];
      const okReal = verReal && rs != null && rs.start < winB && rs.end > winA;
      return okProy || okReal;
    });
  const ocultas = items.length - filas.length;

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

  // Límites de día (medianoche) dentro del rango → línea roja vertical de cambio
  // de día. Son los comienzos de cada segmento de día salvo el primero.
  const limites = dias.slice(1).map((s) => s.x);
  // Línea vertical de "ahora" (hora actual), si cae dentro del rango visible.
  const nowX =
    now != null && now >= min.getTime() && now <= max.getTime() ? xDe(now) : null;

  return (
    <>
      {toolbar}

      {/* Barra selectora de ventana temporal + presets. */}
      <div className="mb-3 rounded-2xl bg-white shadow-sm border border-slate-200 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-slate-700 tabular-nums">
            {rangoVentana(winStartMs, winEndMs)}
          </span>
          <div className="flex items-center gap-1">
            <PresetBtn onClick={() => aplicarVentana(24 * HORA_MS)}>24 h</PresetBtn>
            <PresetBtn onClick={() => aplicarVentana(48 * HORA_MS)}>48 h</PresetBtn>
            <PresetBtn onClick={() => aplicarVentana(7 * 24 * HORA_MS)}>7 d</PresetBtn>
            <PresetBtn onClick={verTodo}>Todo</PresetBtn>
          </div>
        </div>
        <BrushSelector
          fullMin={fullMinMs}
          fullMax={fullMaxMs}
          value={{ start: winStartMs, end: winEndMs }}
          now={now}
          onChange={(start, end) => setView({ start, end })}
        />
      </div>

      <div
        ref={scrollRef}
        className="overflow-auto max-h-[75vh] rounded-2xl bg-white shadow-sm border border-slate-200"
      >
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
                {limites.map((x, li) => (
                  <div
                    key={"limh" + li}
                    className="absolute top-0 h-full border-l-2 border-red-500/60"
                    style={{ left: x }}
                  />
                ))}
                {nowX != null && (
                  <div
                    className="absolute top-0 h-full border-l-2 border-[#1627b1]"
                    style={{ left: nowX }}
                  />
                )}
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
                {limites.map((x, li) => (
                  <div
                    key={"limhh" + li}
                    className="absolute top-0 h-full border-l-2 border-red-500/60"
                    style={{ left: x }}
                  />
                ))}
                {nowX != null && (
                  <div
                    className="absolute top-0 h-full border-l-2 border-[#1627b1]"
                    style={{ left: nowX }}
                  >
                    <span className="absolute -top-0.5 left-1 rounded bg-[#1627b1] px-1 text-[10px] font-bold text-white whitespace-nowrap">
                      ahora {now != null ? formatHHMM(now) : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Filas de OTs (solo las que intersectan la ventana) */}
          {filas.map(({ o, idx }, rowI) => {
            const lavado = o.tipo === "LAVADO";
            const rs = reales[idx];
            const proyLeft = xDe(new Date(o.inicio).getTime());
            const proyWidth = Math.max(4, xDe(new Date(o.fin).getTime()) - proyLeft);
            return (
              <div
                key={o.id}
                className={"flex items-stretch " + (rowI % 2 ? "bg-white" : "bg-slate-50/40")}
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
                <div
                  className="relative overflow-hidden border-b border-slate-100"
                  style={{ width: trackW }}
                >
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-l border-slate-100"
                      style={{ left: t.x }}
                    />
                  ))}

                  {/* Cambio de día: línea roja vertical en cada medianoche */}
                  {limites.map((x, li) => (
                    <div
                      key={"lim" + li}
                      className="absolute top-0 h-full border-l-2 border-red-500/60"
                      style={{ left: x }}
                    />
                  ))}

                  {/* Hora actual: línea vertical */}
                  {nowX != null && (
                    <div
                      className="absolute top-0 h-full border-l-2 border-[#1627b1]"
                      style={{ left: nowX }}
                    />
                  )}

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

                  {/* Pausas: segmentos grises sólidos sobre la barra real */}
                  {verReal &&
                    rs &&
                    o.pausas.map((p, pi) => {
                      const ini = Math.max(rs.start, new Date(p.inicio).getTime());
                      const fin = Math.min(rs.end, new Date(p.fin).getTime());
                      if (fin <= ini) return null;
                      return (
                        <div
                          key={pi}
                          className="absolute top-1/2 -translate-y-1/2 z-30 rounded-sm bg-slate-500"
                          style={{
                            left: xDe(ini),
                            width: Math.max(2, xDe(fin) - xDe(ini)),
                            height: 26,
                          }}
                          title={`Pausado: ${rangoMs(new Date(p.inicio).getTime(), new Date(p.fin).getTime())}`}
                        />
                      );
                    })}
                </div>
              </div>
            );
          })}
          {filas.length === 0 && (
            <div className="p-6 text-sm text-slate-500" style={{ width: LABEL_W + trackW }}>
              Ninguna OT cae en la ventana seleccionada. Movés la barra de arriba o tocás{" "}
              <b>Todo</b> para ver el rango completo.
            </div>
          )}
        </div>
      </div>

      {ocultas > 0 && (
        <p className="mt-2 text-sm text-slate-500">
          Mostrando <b>{filas.length}</b> de {items.length} OTs · {ocultas} fuera de la ventana.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
        <Leyenda className="bg-sky-500" label="Proyectado: Lavado" />
        <Leyenda className="bg-emerald-500" label="Proyectado: Pintura" />
        <span className="text-slate-300">|</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm border-2 border-dotted border-slate-700" />
          Real (línea de puntos)
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-3 w-5 rounded-sm bg-slate-500" />
          Pausado
        </span>
        <span className="text-slate-300">|</span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-4 w-0.5 bg-[#1627b1]" />
          Ahora
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="inline-block h-4 w-0.5 bg-red-500" />
          Cambio de día
        </span>
      </div>
    </>
  );
}

function PresetBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

/**
 * Barra selectora de ventana temporal (brush). Representa toda la extensión de
 * datos (`fullMin`..`fullMax`) con un recuadro que se puede arrastrar para
 * desplazar la ventana y redimensionar desde los bordes. Soporta mouse y touch
 * vía pointer events. El cambio se comunica con `onChange(start, end)`.
 */
function BrushSelector({
  fullMin,
  fullMax,
  value,
  now,
  onChange,
}: {
  fullMin: number;
  fullMax: number;
  value: { start: number; end: number };
  now: number | null;
  onChange: (start: number, end: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const drag = React.useRef<null | { mode: "pan" | "l" | "r"; x: number; s: number; e: number }>(
    null,
  );
  const span = Math.max(1, fullMax - fullMin);
  const pct = (t: number) => ((t - fullMin) / span) * 100;
  const leftPct = Math.max(0, Math.min(100, pct(value.start)));
  const widthPct = Math.max(0.5, Math.min(100 - leftPct, pct(value.end) - pct(value.start)));
  const nowPct = now != null && now >= fullMin && now <= fullMax ? pct(now) : null;

  const begin = (mode: "pan" | "l" | "r") => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    ref.current?.setPointerCapture(e.pointerId);
    drag.current = { mode, x: e.clientX, s: value.start, e: value.end };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !ref.current) return;
    const w = ref.current.getBoundingClientRect().width || 1;
    const dms = ((e.clientX - d.x) / w) * span;
    const minW = HORA_MS;
    if (d.mode === "pan") {
      const o = clampVentana(d.s + dms, d.e + dms, fullMin, fullMax);
      onChange(o.start, o.end);
    } else if (d.mode === "l") {
      const s = Math.min(Math.max(d.s + dms, fullMin), d.e - minW);
      onChange(s, d.e);
    } else {
      const en = Math.max(Math.min(d.e + dms, fullMax), d.s + minW);
      onChange(d.s, en);
    }
  };
  const end = () => {
    drag.current = null;
  };

  return (
    <div
      ref={ref}
      className="relative h-10 select-none touch-none rounded-lg border border-slate-200 bg-slate-100"
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {nowPct != null && (
        <div className="absolute top-0 h-full w-px bg-[#1627b1]" style={{ left: `${nowPct}%` }} />
      )}
      <div
        className="absolute top-0 h-full cursor-grab rounded-md border-2 border-[#1627b1] bg-[#1627b1]/15 active:cursor-grabbing"
        style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        onPointerDown={begin("pan")}
      >
        <div
          className="absolute -left-1.5 top-0 flex h-full w-3 cursor-ew-resize items-center justify-center"
          onPointerDown={begin("l")}
        >
          <span className="h-5 w-1 rounded bg-[#1627b1]" />
        </div>
        <div
          className="absolute -right-1.5 top-0 flex h-full w-3 cursor-ew-resize items-center justify-center"
          onPointerDown={begin("r")}
        >
          <span className="h-5 w-1 rounded bg-[#1627b1]" />
        </div>
      </div>
    </div>
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
function formatHHMM(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function rango(inicioISO: string, finISO: string): string {
  return `${formatFechaHora(inicioISO)} → ${formatFechaHora(finISO)}`;
}
function rangoMs(inicioMs: number, finMs: number): string {
  return `${formatFechaHora(new Date(inicioMs))} → ${formatFechaHora(new Date(finMs))}`;
}
function rangoVentana(inicioMs: number, finMs: number): string {
  return `${formatFechaHora(new Date(inicioMs))} → ${formatFechaHora(new Date(finMs))}`;
}

/**
 * Ventana de las últimas `widthMs` ms terminando en `nowMs` (o en `fullMax` si
 * "ahora" cae después de los datos), acotada al rango disponible.
 */
function ventanaUltimas(
  fullMin: number,
  fullMax: number,
  nowMs: number,
  widthMs: number,
): { start: number; end: number } {
  const span = fullMax - fullMin;
  const w = Math.min(widthMs, span);
  const end = Math.min(nowMs, fullMax);
  return clampVentana(end - w, end, fullMin, fullMax);
}

/** Acota [start, end] a [fullMin, fullMax] conservando el ancho cuando se puede. */
function clampVentana(
  start: number,
  end: number,
  fullMin: number,
  fullMax: number,
): { start: number; end: number } {
  const w = Math.min(end - start, fullMax - fullMin);
  let s = start;
  let e = start + w;
  if (s < fullMin) {
    s = fullMin;
    e = fullMin + w;
  }
  if (e > fullMax) {
    e = fullMax;
    s = fullMax - w;
  }
  if (s < fullMin) s = fullMin;
  return { start: s, end: e };
}
