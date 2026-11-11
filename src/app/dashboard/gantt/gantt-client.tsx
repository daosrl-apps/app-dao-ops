"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Droplets, Paintbrush, ZoomIn, ZoomOut } from "lucide-react";
import { formatFecha, formatFechaHora } from "@/lib/utils";

export interface GanttOT {
  id: string;
  numero: number;
  cantidad: number;
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
  minutosGanchera?: number;
  minutosColor?: number;
}

const ROW_H_DESKTOP = 52;
const ROW_H_MOBILE = 40;
const LABEL_W_DESKTOP = 240;
const LABEL_W_MOBILE_LANDSCAPE = 155;
const LABEL_W_MOBILE_PORTRAIT = 128;
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
/// Ventana por defecto: 24 h hacia atrás + 24 h hacia adelante, con "ahora" en el medio.
const VENTANA_DEFAULT_SEMI_MS = 24 * HORA_MS;

export function GanttClient({ items }: { items: GanttOT[] }) {
  const router = useRouter();
  const [px, setPx] = React.useState(PX_DEFAULT);
  const [verProyectado, setVerProyectado] = React.useState(true);
  const [verReal, setVerReal] = React.useState(true);
  const [view, setView] = React.useState<{ start: number; end: number } | null>(null);
  const [mostrarControlesMobile, setMostrarControlesMobile] = React.useState(false);
  const [viewport, setViewport] = React.useState<{ w: number; h: number }>({ w: 1200, h: 800 });
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const updateSize = () => {
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    };
    updateSize();
    window.addEventListener("resize", updateSize);
    window.addEventListener("orientationchange", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
      window.removeEventListener("orientationchange", updateSize);
    };
  }, []);

  const isPhone = viewport.w < 768 || viewport.h < 520;
  const labelW = isPhone
    ? viewport.w < 480
      ? LABEL_W_MOBILE_PORTRAIT
      : LABEL_W_MOBILE_LANDSCAPE
    : LABEL_W_DESKTOP;
  const rowH = isPhone ? ROW_H_MOBILE : ROW_H_DESKTOP;

  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    setNow(Date.now());
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

  // Inicializa la ventana centrada en "ahora" (±24 h) la primera vez que hay datos.
  React.useEffect(() => {
    if (!hayDatos) return;
    setView((cur) => cur ?? ventanaCentrada(Date.now(), VENTANA_DEFAULT_SEMI_MS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hayDatos, fullMinMs, fullMaxMs]);

  // Al cambiar la ventana, reseteamos el scroll horizontal al inicio.
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [view?.start, view?.end]);

  const zoom = (factor: number) =>
    setPx((p) => Math.min(PX_MAX, Math.max(PX_MIN, Math.round(p * factor))));

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
    <div className="mb-1.5 sm:mb-3 flex flex-wrap items-center justify-between gap-1.5 sm:gap-3">
      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
        <FiltroToggle activo={verProyectado} onClick={() => setVerProyectado((v) => !v)} compact={isPhone}>
          <span className="inline-block h-2.5 w-4 sm:h-3 sm:w-5 rounded-sm bg-emerald-500" />
          Proyectado
        </FiltroToggle>
        <FiltroToggle activo={verReal} onClick={() => setVerReal((v) => !v)} compact={isPhone}>
          <span className="inline-block h-2.5 w-4 sm:h-3 sm:w-5 rounded-sm border-2 border-dotted border-slate-700" />
          Real
        </FiltroToggle>
        {isPhone && hayDatos && (
          <div className="flex items-center gap-1">
            <PresetBtn onClick={() => aplicarVentana(24 * HORA_MS)}>24h</PresetBtn>
            <PresetBtn onClick={() => aplicarVentana(48 * HORA_MS)}>48h</PresetBtn>
            <PresetBtn onClick={verTodo}>Todo</PresetBtn>
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        {isPhone && hayDatos && (
          <button
            onClick={() => setMostrarControlesMobile((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
          >
            {mostrarControlesMobile ? (
              <>
                Ocultar regla <ChevronUp className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Regla <ChevronDown className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        )}
        <span className="hidden sm:inline text-sm text-slate-500">Zoom</span>
        <button
          onClick={() => zoom(1 / 1.4)}
          className="rounded-lg border border-slate-300 p-1.5 sm:p-2 text-slate-700 hover:bg-slate-100"
          aria-label="Alejar"
        >
          <ZoomOut className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        </button>
        <button
          onClick={() => zoom(1.4)}
          className="rounded-lg border border-slate-300 p-1.5 sm:p-2 text-slate-700 hover:bg-slate-100"
          aria-label="Acercar"
        >
          <ZoomIn className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
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

  const limites = dias.slice(1).map((s) => s.x);
  const nowX =
    now != null && now >= min.getTime() && now <= max.getTime() ? xDe(now) : null;

  const dateHeaderH = isPhone ? 22 : 28;
  const hourHeaderH = isPhone ? 20 : 26;

  return (
    <>
      {toolbar}

      {/* Barra selectora de ventana temporal + presets (en teléfono se oculta por defecto para dar máximo lugar al gráfico). */}
      {(!isPhone || mostrarControlesMobile) && (
        <div className="mb-2 sm:mb-3 rounded-xl sm:rounded-2xl bg-white shadow-sm border border-slate-200 p-2 sm:p-3">
          <div className="mb-1.5 sm:mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs sm:text-sm font-semibold text-slate-700 tabular-nums">
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
      )}

      <div
        ref={scrollRef}
        className="overflow-auto rounded-xl sm:rounded-2xl bg-white shadow-sm border border-slate-200"
        style={{
          maxHeight: isPhone ? "calc(100dvh - 54px)" : "75vh",
        }}
      >
        <div style={{ width: labelW + trackW }}>
          {/* Encabezado: en escritorio queda sticky; en teléfono se desplaza al hacer scroll vertical para no tapar la pantalla */}
          <div className={isPhone ? "bg-slate-50" : "sticky top-0 z-30 bg-slate-50"}>
            {/* Fila de fecha */}
            <div className="flex border-b border-slate-200">
              <div
                className="sticky left-0 z-10 flex items-center bg-slate-50 border-r border-slate-200 px-2 sm:px-3 text-[10px] sm:text-xs font-bold uppercase tracking-wide text-slate-500"
                style={{ width: labelW, minWidth: labelW, height: dateHeaderH }}
              >
                Producto / Piezas
              </div>
              <div className="relative" style={{ width: trackW, height: dateHeaderH }}>
                {dias.map((s, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-slate-200 flex items-center"
                    style={{ left: s.x, width: s.w }}
                  >
                    <span className="px-1.5 sm:px-2 text-[10px] sm:text-xs font-bold text-slate-600 whitespace-nowrap">
                      {s.label}
                    </span>
                  </div>
                ))}
                {limites.map((x, li) => (
                  <div
                    key={"limh" + li}
                    className="absolute top-0 h-full border-l-2 border-amber-500/70"
                    style={{ left: x }}
                  />
                ))}
                {nowX != null && (
                  <div
                    className="absolute top-0 h-full border-l-2 border-red-600"
                    style={{ left: nowX }}
                  />
                )}
              </div>
            </div>
            {/* Fila de hora */}
            <div className="flex border-b border-slate-200">
              <div
                className="sticky left-0 z-10 bg-slate-50 border-r border-slate-200"
                style={{ width: labelW, minWidth: labelW, height: hourHeaderH }}
              />
              <div className="relative" style={{ width: trackW, height: hourHeaderH }}>
                {ticks.map((t, i) => (
                  <div
                    key={i}
                    className="absolute top-0 h-full border-l border-slate-200"
                    style={{ left: t.x }}
                  >
                    {t.label && (
                      <span className="absolute left-1 top-0.5 text-[10px] sm:text-[11px] font-medium text-slate-500 whitespace-nowrap">
                        {pad(t.d.getHours())}:00
                      </span>
                    )}
                  </div>
                ))}
                {limites.map((x, li) => (
                  <div
                    key={"limhh" + li}
                    className="absolute top-0 h-full border-l-2 border-amber-500/70"
                    style={{ left: x }}
                  />
                ))}
                {nowX != null && (
                  <div
                    className="absolute top-0 h-full border-l-2 border-red-600"
                    style={{ left: nowX }}
                  >
                    <span className="absolute -top-0.5 left-1 rounded bg-red-600 px-1 text-[9px] sm:text-[10px] font-bold text-white whitespace-nowrap">
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
                style={{ minHeight: rowH }}
              >
                <button
                  onClick={() => router.push(`/dashboard/ordenes/${o.id}`)}
                  className="sticky left-0 z-10 flex items-center gap-1.5 sm:gap-2 border-r border-b border-slate-200 bg-inherit px-2 sm:px-3 py-1 sm:py-2 text-left text-xs sm:text-sm font-bold text-slate-800 hover:text-[#1627b1]"
                  style={{ width: labelW, minWidth: labelW }}
                >
                  {lavado ? (
                    <Droplets className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-sky-600" />
                  ) : (
                    <Paintbrush className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0 text-emerald-600" />
                  )}
                  <span className="whitespace-normal break-words leading-tight">
                    {o.titulo}{" "}
                    <span className="inline-block rounded bg-slate-200/80 px-1 py-0.5 text-[10px] sm:text-xs font-extrabold text-slate-700 tabular-nums">
                      {o.cantidad} pzs
                    </span>
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

                  {/* Cambio de día: línea vertical en cada medianoche */}
                  {limites.map((x, li) => (
                    <div
                      key={"lim" + li}
                      className="absolute top-0 h-full border-l-2 border-amber-500/70"
                      style={{ left: x }}
                    />
                  ))}

                  {/* Hora actual: línea vertical */}
                  {nowX != null && (
                    <div
                      className="absolute top-0 h-full border-l-2 border-red-600"
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
                      style={{ left: proyLeft, width: proyWidth, height: isPhone ? 13 : 16 }}
                      title={`${o.titulo} (${o.cantidad} pzs) · Proyectado: ${rango(o.inicio, o.fin)}`}
                      aria-label={`${o.titulo} (${o.cantidad} pzs) proyectado`}
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
                        height: isPhone ? 21 : 26,
                      }}
                      title={`${o.titulo} (${o.cantidad} pzs) · Real: ${rangoMs(rs.start, rs.end)}`}
                      aria-label={`${o.titulo} (${o.cantidad} pzs) real`}
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
                            height: isPhone ? 21 : 26,
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
            <div className="p-6 text-sm text-slate-500" style={{ width: labelW + trackW }}>
              Ninguna OT cae en la ventana seleccionada. Movés la barra de arriba o tocás{" "}
              <b>Todo</b> para ver el rango completo.
            </div>
          )}
        </div>
      </div>

      {ocultas > 0 && (
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500">
          Mostrando <b>{filas.length}</b> de {items.length} OTs · {ocultas} fuera de la ventana.
        </p>
      )}

      <div className="mt-2 sm:mt-3 flex flex-wrap items-center gap-2.5 sm:gap-4 text-xs sm:text-sm text-slate-600">
        <Leyenda className="bg-sky-500" label="Proyectado: Lavado" />
        <Leyenda className="bg-emerald-500" label="Proyectado: Pintura" />
        <span className="text-slate-300">|</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 sm:h-3 sm:w-5 rounded-sm border-2 border-dotted border-slate-700" />
          Real
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 sm:h-3 sm:w-5 rounded-sm bg-slate-500" />
          Pausado
        </span>
        <span className="text-slate-300">|</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-0.5 bg-red-600" />
          Ahora
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3.5 w-0.5 bg-amber-500" />
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
      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

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
      className="relative h-8 sm:h-10 select-none touch-none rounded-lg border border-slate-200 bg-slate-100"
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
    >
      {nowPct != null && (
        <div className="absolute top-0 h-full w-px bg-red-600" style={{ left: `${nowPct}%` }} />
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
          <span className="h-4 sm:h-5 w-1 rounded bg-[#1627b1]" />
        </div>
        <div
          className="absolute -right-1.5 top-0 flex h-full w-3 cursor-ew-resize items-center justify-center"
          onPointerDown={begin("r")}
        >
          <span className="h-4 sm:h-5 w-1 rounded bg-[#1627b1]" />
        </div>
      </div>
    </div>
  );
}

function FiltroToggle({
  activo,
  onClick,
  compact,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={
        "inline-flex items-center gap-1.5 rounded-lg border font-medium transition-colors " +
        (compact ? "px-2 py-1 text-xs " : "px-3 py-2 text-sm ") +
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
    <span className="inline-flex items-center gap-1.5">
      <span className={"inline-block h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-sm " + className} />
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

function ventanaCentrada(nowMs: number, semiMs: number): { start: number; end: number } {
  return { start: nowMs - semiMs, end: nowMs + semiMs };
}

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
