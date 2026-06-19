"use client";

/**
 * Gantt para televisor.
 *
 * Diseño pensado para mirarse de lejos: una sola línea de tiempo horizontal con
 * la HORA ACTUAL fija en el borde IZQUIERDO. Las OTs se ubican según su horario
 * y se van corriendo hacia la izquierda a medida que pasa el tiempo (la que está
 * EN_CURSO cruza el borde izquierdo; las próximas vienen desde la derecha).
 *
 * Datos: GET /api/tv/gantt (público). Polling cada 4 s + tick local cada 1 s
 * para mover la línea de "ahora" y los bloques suavemente.
 */
import * as React from "react";
import Link from "next/link";
import { Droplets, Paintbrush, LayoutGrid } from "lucide-react";

interface GanttOrden {
  id: string;
  numero: number;
  tipo: "LAVADO" | "PINTURA";
  color: string;
  estado: string;
  cantidad: number;
  clienteNombre: string;
  articulo: string;
  inicio: string;
  fin: string;
}

interface GanttResp {
  serverNow: string;
  ordenes: GanttOrden[];
}

const POLL_MS = 4000;
const HORA_MS = 3_600_000;
/// Ventana visible: desde "ahora" (izquierda) hasta ahora + N horas (derecha).
const VENTANA_H = 8;
const VENTANA_MS = VENTANA_H * HORA_MS;

export function TvGanttClient() {
  const [data, setData] = React.useState<GanttResp | null>(null);
  const [now, setNow] = React.useState(() => Date.now());
  // Drift cliente↔servidor: lo aplicamos para que la línea de "ahora" no se
  // corra si el reloj del televisor está desfasado.
  const driftRef = React.useRef(0);

  React.useEffect(() => {
    const fetchIt = async () => {
      const res = await fetch("/api/tv/gantt", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as GanttResp;
      driftRef.current = new Date(json.serverNow).getTime() - Date.now();
      setData(json);
    };
    fetchIt();
    const t = setInterval(fetchIt, POLL_MS);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const nowEff = now + driftRef.current;

  const ticks = React.useMemo(() => {
    const arr: { frac: number; label: string }[] = [];
    for (let i = 0; i <= VENTANA_H; i++) {
      arr.push({ frac: i / VENTANA_H, label: formatHHMM(nowEff + i * HORA_MS) });
    }
    return arr;
  }, [nowEff]);

  // Bloques visibles (recortados a la ventana).
  const bloques = (data?.ordenes ?? [])
    .map((o) => {
      const ini = new Date(o.inicio).getTime();
      const fin = new Date(o.fin).getTime();
      const leftFrac = (ini - nowEff) / VENTANA_MS;
      const rightFrac = (fin - nowEff) / VENTANA_MS;
      const visLeft = Math.max(0, leftFrac);
      const visRight = Math.min(1, rightFrac);
      return { o, leftFrac, visLeft, width: visRight - visLeft };
    })
    .filter((b) => b.width > 0.0001);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-6 py-4 shrink-0">
        <h1 className="text-3xl md:text-4xl font-black tracking-tight">Gantt — Línea</h1>
        <div className="flex items-center gap-5">
          <div className="font-mono tabular-nums text-4xl md:text-5xl font-black text-emerald-300">
            {formatHHMM(nowEff)}
          </div>
          <Link
            href="/tv"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 px-3 py-2 text-sm text-slate-300"
          >
            <LayoutGrid className="h-4 w-4" /> Menú
          </Link>
        </div>
      </header>

      {/* Regla de horas */}
      <div className="relative h-8 mx-6 border-b border-slate-700 shrink-0">
        {ticks.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 flex items-end"
            style={{ left: `${t.frac * 100}%` }}
          >
            <span className="-translate-x-1/2 text-sm md:text-base font-bold text-slate-400 tabular-nums">
              {t.label}
            </span>
          </div>
        ))}
      </div>

      {/* Pista del Gantt */}
      <div className="relative flex-1 mx-6 my-4 overflow-hidden">
        {/* Líneas verticales de hora */}
        {ticks.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-slate-800"
            style={{ left: `${t.frac * 100}%` }}
          />
        ))}

        {bloques.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-3xl text-slate-500">No hay órdenes programadas</p>
          </div>
        ) : (
          bloques.map((b) => (
            <Bloque
              key={b.o.id}
              o={b.o}
              left={b.visLeft * 100}
              width={b.width * 100}
              cortadoIzq={b.leftFrac < 0}
            />
          ))
        )}

        {/* Línea de AHORA (borde izquierdo) */}
        <div className="absolute top-0 bottom-0 left-0 w-1 bg-yellow-400 z-30" />
        <div className="absolute top-1 left-1 z-30 rounded bg-yellow-400 text-slate-900 text-sm font-black px-2 py-0.5">
          AHORA
        </div>
      </div>
    </div>
  );
}

function Bloque({
  o,
  left,
  width,
  cortadoIzq,
}: {
  o: GanttOrden;
  left: number;
  width: number;
  cortadoIzq: boolean;
}) {
  const lavado = o.tipo === "LAVADO";
  const enCurso = o.estado === "EN_CURSO";
  const base = lavado ? "bg-sky-600" : "bg-emerald-600";
  return (
    <div
      className={
        "absolute top-2 bottom-2 rounded-2xl shadow-xl overflow-hidden p-3 md:p-4 flex flex-col gap-1 " +
        base +
        (enCurso ? " ring-4 ring-yellow-400" : "") +
        (cortadoIzq ? " rounded-l-none" : "")
      }
      style={{ left: `${left}%`, width: `calc(${width}% - 6px)` }}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={
            "inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide text-xs px-2 py-0.5 " +
            (lavado ? "bg-sky-200 text-sky-900" : "bg-emerald-100 text-emerald-900")
          }
        >
          {lavado ? <Droplets className="h-3.5 w-3.5" /> : <Paintbrush className="h-3.5 w-3.5" />}
          {lavado ? "Lavado" : "Pintura"}
        </span>
        {enCurso && (
          <span className="rounded-full bg-yellow-400 text-slate-900 text-xs font-black px-2 py-0.5">
            EN CURSO
          </span>
        )}
      </div>
      <p className="text-2xl md:text-3xl font-black leading-tight truncate">{o.clienteNombre}</p>
      <p className="text-lg md:text-xl font-bold text-white/90 truncate">{o.articulo}</p>
      <p className="text-base md:text-lg font-semibold text-white/80 truncate">
        {o.cantidad} pzs
        {o.tipo === "PINTURA" && ` · ${o.color}`}
      </p>
      <p className="mt-auto text-base md:text-lg font-bold tabular-nums text-white/90">
        {formatHHMM(new Date(o.inicio).getTime())} → {formatHHMM(new Date(o.fin).getTime())}
      </p>
    </div>
  );
}

function formatHHMM(ms: number) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
