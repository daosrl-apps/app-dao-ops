"use client";

/**
 * Pantalla de TV — pensada para un televisor en pantalla completa sobre la
 * línea. Diseño:
 *   ┌────────────────────────────────────────────────────────┐
 *   │  ANTERIOR  (fondo blanco, texto gris)                   │
 *   ├────────────────────────────────────────────────────────┤
 *   │  ┌──────┐                                  ┌─────────┐│
 *   │  │ HH:MM│   ACTUAL   (negro / blanco)     │ -HH:MM:SS││
 *   │  └──────┘                                  └─────────┘│
 *   ├────────────────────────────────────────────────────────┤
 *   │  SIGUIENTE                                              │
 *   └────────────────────────────────────────────────────────┘
 *
 * Cuando el actual cambia (el ID es distinto al del render anterior), todas
 * las filas suben un escalón con una animación CSS.
 */
import * as React from "react";
import type { LineaSnapshot, LineaItem } from "@/lib/linea";

const POLL_MS = 2000;

export function TvClient() {
  const [snapshot, setSnapshot] = React.useState<LineaSnapshot | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  const [animandoAvance, setAnimandoAvance] = React.useState(false);
  const prevActualId = React.useRef<string | null>(null);

  React.useEffect(() => {
    const fetchIt = async () => {
      const res = await fetch("/api/tv/actual", { cache: "no-store" });
      if (!res.ok) return;
      setSnapshot(await res.json());
    };
    fetchIt();
    const t = setInterval(fetchIt, POLL_MS);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Detectar avance: el ítem actual cambió de id.
  React.useEffect(() => {
    const id = snapshot?.itemActual?.id ?? null;
    if (prevActualId.current && id && prevActualId.current !== id) {
      setAnimandoAvance(true);
      const t = setTimeout(() => setAnimandoAvance(false), 700);
      return () => clearTimeout(t);
    }
    prevActualId.current = id;
  }, [snapshot?.itemActual?.id]);

  const reloj = formatHHMM(now);

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center">
        <p className="text-3xl">Cargando…</p>
      </div>
    );
  }

  const { itemActual, itemAnterior, itemsSiguientes, serverNow } = snapshot;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 md:p-8 flex flex-col gap-4">
      <RowAnterior item={itemAnterior} animar={animandoAvance} />
      <RowActual
        item={itemActual}
        reloj={reloj}
        now={now}
        serverNow={new Date(serverNow).getTime()}
        animar={animandoAvance}
      />
      <RowSiguiente
        item={itemsSiguientes[0] ?? null}
        animar={animandoAvance}
        orden="próximo"
      />
      <RowSiguiente
        item={itemsSiguientes[1] ?? null}
        animar={animandoAvance}
        orden="luego"
      />
    </div>
  );
}

// =============================================================================
// Filas
// =============================================================================

function RowAnterior({ item, animar }: { item: LineaItem | null; animar: boolean }) {
  return (
    <div
      className={
        "rounded-3xl bg-white text-slate-400 p-5 md:p-6 shadow transition-transform duration-700 ease-out " +
        (animar ? "-translate-y-6 opacity-80" : "")
      }
    >
      <p className="uppercase tracking-widest text-xs md:text-sm text-slate-500 mb-1">
        Orden anterior
      </p>
      {item ? (
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <span className="text-2xl md:text-3xl font-black tracking-tight">
            {item.cliente.nombre}
          </span>
          <span className="text-2xl md:text-3xl font-black tracking-tight">
            {nombreOrden(item)}
          </span>
          <span className="text-base md:text-xl font-bold text-slate-500">
            {item.cantidad} pzs · {item.color}
          </span>
        </div>
      ) : (
        <p className="text-xl md:text-2xl text-slate-400">—</p>
      )}
    </div>
  );
}

function RowActual({
  item,
  reloj,
  now,
  serverNow,
  animar,
}: {
  item: LineaItem | null;
  reloj: string;
  now: number;
  serverNow: number;
  animar: boolean;
}) {
  if (!item) {
    return (
      <div className="rounded-3xl bg-black text-white p-6 shadow-2xl flex items-center justify-center min-h-[24vh]">
        <p className="text-3xl text-slate-400">Línea sin orden en curso</p>
      </div>
    );
  }

  const enPausa = !!item.pausaActiva;
  const enCurso = item.estado === "EN_CURSO";

  // Cálculo del timer.
  const drift = serverNow - now;
  const ahoraServer = now + drift;
  const inicioRealMs = item.inicioReal ? new Date(item.inicioReal).getTime() : ahoraServer;
  const pausaActivaInicioMs = item.pausaActiva
    ? new Date(item.pausaActiva.inicio).getTime()
    : null;
  const finCorteMs = pausaActivaInicioMs ?? ahoraServer;
  const trabajadoMs = enCurso ? finCorteMs - inicioRealMs - item.pausasFinalizadasMs : 0;
  const restanteMs = item.duracionTeoricaSeg * 1000 - trabajadoMs;
  const sobretiempo = enCurso && restanteMs < 0;
  const timerStr = enCurso ? formatHHMMSS(Math.abs(restanteMs)) : "--:--:--";

  return (
    <div
      className={
        "rounded-3xl bg-black text-white p-5 md:p-8 shadow-2xl border-4 border-slate-700 " +
        "transition-transform duration-700 ease-out " +
        (animar ? "scale-[1.02]" : "")
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div className="font-mono tabular-nums text-4xl md:text-6xl font-bold tracking-widest text-emerald-300 drop-shadow">
          {reloj}
        </div>
        <div className="text-right">
          <p className="uppercase tracking-widest text-emerald-400 text-xs md:text-sm">
            En línea
          </p>
          {sobretiempo && (
            <p className="text-red-400 text-sm md:text-base font-medium">SOBRETIEMPO</p>
          )}
          {enPausa && (
            <p className="text-amber-300 text-sm md:text-base font-medium">PAUSADO</p>
          )}
        </div>
      </div>

      <div className="mt-4 md:mt-6 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4 items-center">
        <div>
          <p className="text-4xl md:text-5xl font-black tracking-tight leading-tight">
            {item.cliente.nombre}
          </p>
          <p className="text-3xl md:text-4xl font-black tracking-tight mt-1 text-slate-100">
            {nombreOrden(item)}
          </p>
          <p className="text-2xl md:text-3xl font-bold mt-1 text-slate-200">{item.color}</p>
          <p className="text-xl md:text-2xl font-semibold text-slate-300 mt-1">
            {item.cantidad} piezas
          </p>
        </div>
        <div
          className={
            "font-mono tabular-nums text-6xl md:text-8xl font-black tracking-wider " +
            (sobretiempo
              ? "text-red-500 animate-[blink_1s_step-end_infinite]"
              : enPausa
                ? "text-amber-300"
                : "text-yellow-400")
          }
        >
          {sobretiempo && "+"}
          {timerStr}
        </div>
      </div>
    </div>
  );
}

function RowSiguiente({
  item,
  animar,
  orden,
}: {
  item: LineaItem | null;
  animar: boolean;
  orden: "próximo" | "luego";
}) {
  return (
    <div
      className={
        "rounded-3xl bg-slate-800 text-slate-200 p-5 md:p-6 shadow transition-transform duration-700 ease-out " +
        (animar ? "translate-y-2 opacity-90" : "")
      }
    >
      <p className="uppercase tracking-widest text-xs md:text-sm text-slate-400 mb-1">
        {orden === "próximo" ? "Próxima orden" : "Luego"}
      </p>
      {item ? (
        <div>
          <p className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
            {item.cliente.nombre}
          </p>
          <p className="text-2xl md:text-3xl font-black tracking-tight text-slate-100">
            {nombreOrden(item)}
          </p>
          <p className="text-base md:text-lg font-bold text-slate-400 mt-1">
            {item.cantidad} pzs · {item.color}
          </p>
        </div>
      ) : (
        <p className="text-2xl text-slate-500">—</p>
      )}
    </div>
  );
}

// =============================================================================
// Utils
// =============================================================================

function formatHHMM(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatHHMMSS(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Texto principal: descripción si existe, si no el código. */
function nombreOrden(item: LineaItem) {
  return item.articulo.descripcion?.trim() || item.articulo.codigo;
}
