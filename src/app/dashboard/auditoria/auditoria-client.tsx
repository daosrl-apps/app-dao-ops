"use client";

/**
 * Tabla de auditoría: lista de eventos del sistema con filtro por tipo. La
 * columna "Tipo" se muestra como píldora de color según el tipo de evento.
 */
import * as React from "react";
import { formatFechaHora } from "@/lib/utils";

export interface AuditoriaView {
  id: string;
  tipo: string;
  entidad: string;
  resumen: string;
  usuario: string | null;
  createdAt: string; // ISO
}

const TIPO_PILL: Record<string, string> = {
  CREAR: "bg-emerald-100 text-emerald-800",
  EDITAR: "bg-amber-100 text-amber-800",
  ELIMINAR: "bg-red-100 text-red-800",
  INICIAR: "bg-blue-100 text-blue-800",
  FINALIZAR: "bg-blue-100 text-blue-900",
  PAUSAR: "bg-violet-100 text-violet-800",
  REANUDAR: "bg-violet-100 text-violet-900",
  REORDENAR: "bg-sky-100 text-sky-800",
  SPLIT: "bg-fuchsia-100 text-fuchsia-800",
  IMPORTAR: "bg-teal-100 text-teal-800",
  LOGIN: "bg-slate-200 text-slate-700",
};

export function AuditoriaClient({ items }: { items: AuditoriaView[] }) {
  const [tipo, setTipo] = React.useState<string>("");
  const [entidad, setEntidad] = React.useState<string>("");

  const tipos = React.useMemo(
    () => Array.from(new Set(items.map((i) => i.tipo))).sort(),
    [items],
  );
  const entidades = React.useMemo(
    () => Array.from(new Set(items.map((i) => i.entidad))).sort(),
    [items],
  );

  const filtrados = items.filter(
    (i) => (!tipo || i.tipo === tipo) && (!entidad || i.entidad === entidad),
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={tipo} onChange={setTipo} label="Tipo" options={tipos} />
        <Select value={entidad} onChange={setEntidad} label="Entidad" options={entidades} />
        <span className="text-sm text-slate-500">{filtrados.length} eventos</span>
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        {filtrados.length === 0 ? (
          <p className="p-6 text-slate-500">No hay eventos registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Entidad</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-slate-600">
                      {formatFechaHora(e.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">
                      {e.usuario ?? "—"}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-700">{e.entidad}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide " +
                          (TIPO_PILL[e.tipo] ?? "bg-slate-100 text-slate-700")
                        }
                      >
                        {e.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{e.resumen}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Select({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1627b1]"
    >
      <option value="">{label}: todos</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
