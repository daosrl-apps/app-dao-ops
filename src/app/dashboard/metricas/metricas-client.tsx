"use client";

import * as React from "react";
import { ArrowDown, ArrowRight, ArrowUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { MetricasSnapshot, Delta } from "@/lib/metricas";

const COLOR_TO_HEX: Record<string, string> = {
  Aluminio: "#9ca3af",
  Amarillo: "#facc15",
  "Amarillo maíz": "#eab308",
  Azul: "#2563eb",
  Beige: "#d6c5a0",
  Blanco: "#f3f4f6",
  "Blanco brillante": "#ffffff",
  Estrellita: "#a78bfa",
  "Fluor naranja": "#fb923c",
  "Fluor rosa": "#ec4899",
  "Fluor verde": "#a3e635",
  "Galv / galvanizado": "#a3a3a3",
  Grafito: "#374151",
  Gris: "#6b7280",
  "Gris Shell": "#71717a",
  "Gris Stara": "#52525b",
  "Gris topo": "#737373",
  Marrón: "#92400e",
  Naranja: "#f97316",
  Negro: "#111827",
  "Negro tex": "#1f2937",
  "Negro texturado": "#0f172a",
  "Negro s/mate": "#1e293b",
  Ocre: "#b45309",
  Platil: "#94a3b8",
  Rojo: "#dc2626",
  Rosa: "#f472b6",
  Shell: "#fbbf24",
  Verde: "#16a34a",
  "Sin color / Revisar": "#fb7185",
};

export function MetricasClient({ data }: { data: MetricasSnapshot }) {
  const [busqueda, setBusqueda] = React.useState("");
  const [columnas, setColumnas] = React.useState({
    fecha: true,
    cliente: true,
    articulo: true,
    color: true,
    cantidad: true,
    duracionTeoricaMin: true,
    duracionRealMin: true,
    desviacionPct: true,
  });

  const filas = React.useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return data.detalle;
    return data.detalle.filter((f) =>
      Object.values(f).some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [busqueda, data.detalle]);

  return (
    <section className="mx-auto w-full max-w-6xl p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-1">Métricas</h1>
      <p className="text-slate-600 mb-6">
        Comparativa de los últimos 7 días contra los 7 anteriores.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <MetricaCard label="Órdenes de trabajo" delta={data.ordenesTotales} />
        <MetricaCard label="Piezas pintadas" delta={data.piezasPintadas} />
        <MetricaCard
          label="Órdenes incumplidas (>15%)"
          delta={data.ordenesIncumplidas}
          invertir
        />
        <MetricaCard label="Cambios de color" delta={data.cambiosColor} invertir />
        <MetricaCard label="Cambios de percha" delta={data.cambiosPercha} invertir />
        <MetricaCard label="Piezas lavadas" delta={data.piezasLavadas} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <PieChartCard data={data.piezasPorColor} title="Piezas por color (semana)" />
        <ClientesCard data={data.piezasPorCliente} />
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cualquier columna…"
              className="pl-10"
            />
          </div>
          <details className="relative">
            <summary className="cursor-pointer h-12 px-4 rounded-xl border border-slate-300 bg-white inline-flex items-center text-sm font-medium">
              Columnas visibles
            </summary>
            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl border border-slate-200 shadow-lg p-3 z-10 min-w-[200px]">
              {Object.entries(columnas).map(([k, v]) => (
                <label key={k} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={v}
                    onChange={(e) =>
                      setColumnas((c) => ({ ...c, [k]: e.target.checked }))
                    }
                  />
                  <span className="text-sm">{labelColumna(k)}</span>
                </label>
              ))}
            </div>
          </details>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                {columnas.fecha && <th className="px-3 py-2 text-left">Fecha</th>}
                {columnas.cliente && <th className="px-3 py-2 text-left">Cliente</th>}
                {columnas.articulo && <th className="px-3 py-2 text-left">Artículo</th>}
                {columnas.color && <th className="px-3 py-2 text-left">Color</th>}
                {columnas.cantidad && <th className="px-3 py-2 text-right">Cantidad</th>}
                {columnas.duracionTeoricaMin && (
                  <th className="px-3 py-2 text-right">Teórica (min)</th>
                )}
                {columnas.duracionRealMin && <th className="px-3 py-2 text-right">Real (min)</th>}
                {columnas.desviacionPct && <th className="px-3 py-2 text-right">Δ%</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-5 text-center text-slate-500">
                    Sin datos en el período.
                  </td>
                </tr>
              ) : (
                filas.map((f, i) => (
                  <tr key={i}>
                    {columnas.fecha && <td className="px-3 py-2">{f.fecha}</td>}
                    {columnas.cliente && <td className="px-3 py-2">{f.cliente}</td>}
                    {columnas.articulo && <td className="px-3 py-2">{f.articulo}</td>}
                    {columnas.color && <td className="px-3 py-2">{f.color}</td>}
                    {columnas.cantidad && (
                      <td className="px-3 py-2 text-right">{f.cantidad}</td>
                    )}
                    {columnas.duracionTeoricaMin && (
                      <td className="px-3 py-2 text-right">{f.duracionTeoricaMin}</td>
                    )}
                    {columnas.duracionRealMin && (
                      <td className="px-3 py-2 text-right">{f.duracionRealMin}</td>
                    )}
                    {columnas.desviacionPct && (
                      <td
                        className={
                          "px-3 py-2 text-right font-medium " +
                          (f.desviacionPct > 15
                            ? "text-red-700"
                            : f.desviacionPct < 0
                              ? "text-emerald-700"
                              : "text-slate-700")
                        }
                      >
                        {f.desviacionPct > 0 ? `+${f.desviacionPct}` : f.desviacionPct}%
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function MetricaCard({
  label,
  delta,
  invertir,
}: {
  label: string;
  delta: Delta;
  invertir?: boolean;
}) {
  const sube = delta.delta > 0;
  const baja = delta.delta < 0;
  // Por defecto subir es bueno (verde). Para métricas tipo "incumplidas" o
  // "cambios" subir es malo → `invertir` cambia los colores.
  const subeColor = invertir ? "text-red-700" : "text-emerald-700";
  const bajaColor = invertir ? "text-emerald-700" : "text-red-700";

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
      <p className="text-sm uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-4xl font-bold text-slate-800 mt-1">{delta.actual}</p>
      <p
        className={
          "mt-1 text-sm flex items-center gap-1 " +
          (sube ? subeColor : baja ? bajaColor : "text-slate-500")
        }
      >
        {sube ? (
          <ArrowUp className="h-4 w-4" />
        ) : baja ? (
          <ArrowDown className="h-4 w-4" />
        ) : (
          <ArrowRight className="h-4 w-4" />
        )}
        {delta.pct === null
          ? `${delta.delta > 0 ? "+" : ""}${delta.delta} (semana previa: 0)`
          : `${delta.delta > 0 ? "+" : ""}${delta.delta} (${
              delta.pct > 0 ? "+" : ""
            }${Math.round(delta.pct)}%)`}
      </p>
    </div>
  );
}

function PieChartCard({
  data,
  title,
}: {
  data: { color: string; cantidad: number }[];
  title: string;
}) {
  const total = data.reduce((acc, d) => acc + d.cantidad, 0);
  if (total === 0) {
    return (
      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
        <p className="text-sm uppercase tracking-wide text-slate-500">{title}</p>
        <p className="text-slate-500 mt-4">Sin datos.</p>
      </div>
    );
  }

  // SVG pie chart manual.
  const R = 80;
  const cx = 100;
  const cy = 100;
  let angle = -Math.PI / 2;
  const slices = data.map((d) => {
    const portion = d.cantidad / total;
    const next = angle + portion * Math.PI * 2;
    const x1 = cx + R * Math.cos(angle);
    const y1 = cy + R * Math.sin(angle);
    const x2 = cx + R * Math.cos(next);
    const y2 = cy + R * Math.sin(next);
    const largeArc = portion > 0.5 ? 1 : 0;
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    const slice = { color: d.color, cantidad: d.cantidad, path, hex: COLOR_TO_HEX[d.color] ?? "#94a3b8" };
    angle = next;
    return slice;
  });

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
      <p className="text-sm uppercase tracking-wide text-slate-500 mb-3">{title}</p>
      <div className="flex flex-wrap items-center gap-6">
        <svg viewBox="0 0 200 200" className="h-48 w-48 shrink-0">
          {slices.map((s, i) => (
            <path key={i} d={s.path} fill={s.hex} stroke="white" strokeWidth="1.5" />
          ))}
        </svg>
        <ul className="flex-1 min-w-[180px] space-y-1 text-sm">
          {data.slice(0, 10).map((d) => (
            <li key={d.color} className="flex items-center gap-2">
              <span
                className="h-3 w-3 rounded-sm border border-slate-300"
                style={{ backgroundColor: COLOR_TO_HEX[d.color] ?? "#94a3b8" }}
              />
              <span className="flex-1 text-slate-700">{d.color}</span>
              <span className="font-medium text-slate-800">{d.cantidad}</span>
              <span className="text-slate-500">
                {((d.cantidad / total) * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function ClientesCard({ data }: { data: { cliente: string; cantidad: number }[] }) {
  const total = data.reduce((acc, d) => acc + d.cantidad, 0);
  const max = data[0]?.cantidad ?? 1;
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
      <p className="text-sm uppercase tracking-wide text-slate-500 mb-3">
        Piezas por cliente (semana)
      </p>
      {data.length === 0 ? (
        <p className="text-slate-500">Sin datos.</p>
      ) : (
        <ul className="space-y-2">
          {data.slice(0, 8).map((d) => (
            <li key={d.cliente}>
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-700 truncate">{d.cliente}</span>
                <span className="text-slate-600">
                  {d.cantidad}
                  {total > 0 && (
                    <span className="text-slate-400 ml-1">
                      ({((d.cantidad / total) * 100).toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full mt-1">
                <div
                  className="h-2 bg-[#1627b1] rounded-full"
                  style={{ width: `${(d.cantidad / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelColumna(k: string) {
  const map: Record<string, string> = {
    fecha: "Fecha",
    cliente: "Cliente",
    articulo: "Artículo",
    color: "Color",
    cantidad: "Cantidad",
    duracionTeoricaMin: "Teórica (min)",
    duracionRealMin: "Real (min)",
    desviacionPct: "Δ%",
  };
  return map[k] ?? k;
}
