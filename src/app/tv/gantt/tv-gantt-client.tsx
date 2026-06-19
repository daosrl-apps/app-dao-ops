"use client";

/**
 * Gantt para televisor.
 *
 * Mismo estilo de filas que el Gantt del sistema (una OT por fila, barra
 * horizontal), pero pensado para mirarse de lejos: fondo oscuro, tipografía
 * grande y la HORA ACTUAL fija en el borde IZQUIERDO. La ventana muestra desde
 * "ahora" (izquierda) hasta ahora + N horas (derecha); las OTs se corren hacia
 * la izquierda a medida que pasa el tiempo (la EN_CURSO cruza el borde).
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
/// Ancho de la columna de etiquetas (nombre de la OT), a la izquierda.
const LABEL_W = 340;

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

  // Fracción horizontal [0..1] de un instante dentro de la ventana visible.
  const fracDe = (ms: number) => (ms - nowEff) / VENTANA_MS;

  // Solo las OTs que intersectan la ventana visible (una fila por OT).
  const filas = (data?.ordenes ?? [])
    .map((o) => {
      const leftFrac = fracDe(new Date(o.inicio).getTime());
      const rightFrac = fracDe(new Date(o.fin).getTime());
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

      {/* Regla de horas (alineada con el track, dejando la columna de etiquetas) */}
      <div className="flex shrink-0 px-6">
        <div style={{ width: LABEL_W, minWidth: LABEL_W }} />
        <div className="relative h-8 flex-1 border-b border-slate-700">
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
      </div>

      {/* Filas de OTs */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {filas.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-3xl text-slate-500">No hay órdenes programadas</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filas.map((b) => (
              <Fila
                key={b.o.id}
                o={b.o}
                left={b.visLeft * 100}
                width={b.width * 100}
                cortadoIzq={b.leftFrac < 0}
                ticks={ticks}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Fila({
  o,
  left,
  width,
  cortadoIzq,
  ticks,
}: {
  o: GanttOrden;
  left: number;
  width: number;
  cortadoIzq: boolean;
  ticks: { frac: number; label: string }[];
}) {
  const lavado = o.tipo === "LAVADO";
  const enCurso = o.estado === "EN_CURSO";
  const barra = lavado ? "bg-sky-600" : "bg-emerald-600";

  return (
    <div className="flex items-stretch gap-0">
      {/* Etiqueta: datos de la OT (siempre visible, a la izquierda) */}
      <div
        className="flex flex-col justify-center pr-4 shrink-0"
        style={{ width: LABEL_W, minWidth: LABEL_W }}
      >
        <div className="flex items-center gap-2">
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
        <p className="text-xl md:text-2xl font-black leading-tight truncate">{o.clienteNombre}</p>
        <p className="text-sm md:text-base font-bold text-white/70 truncate">{o.articulo}</p>
      </div>

      {/* Track: barra horizontal posicionada por horario */}
      <div className="relative flex-1 h-16 rounded-xl bg-slate-800/40 overflow-hidden">
        {/* Líneas verticales de hora */}
        {ticks.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-slate-700/60"
            style={{ left: `${t.frac * 100}%` }}
          />
        ))}

        {/* Barra de la OT */}
        <div
          className={
            "absolute top-2 bottom-2 rounded-lg shadow-lg overflow-hidden px-3 flex items-center " +
            barra +
            (enCurso ? " ring-4 ring-yellow-400" : "") +
            (cortadoIzq ? " rounded-l-none" : "")
          }
          style={{ left: `${left}%`, width: `calc(${width}% - 4px)` }}
        >
          <span className="text-base md:text-lg font-black tabular-nums text-white whitespace-nowrap">
            {o.cantidad} pzs
            {o.tipo === "PINTURA" && ` · ${o.color}`}
            <span className="text-white/80 font-bold">
              {"  "}
              {formatHHMM(new Date(o.inicio).getTime())}→{formatHHMM(new Date(o.fin).getTime())}
            </span>
          </span>
        </div>

        {/* Línea de AHORA (borde izquierdo) */}
        <div className="absolute top-0 bottom-0 left-0 w-1 bg-yellow-400 z-30" />
      </div>
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
