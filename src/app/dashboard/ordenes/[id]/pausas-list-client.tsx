"use client";

/**
 * Lista de pausas de una OT (sección "Pausas" del detalle). Es client porque
 * permite eliminar cada pausa (SUPERVISOR / ADMIN). Cada línea muestra el
 * motivo, el usuario que pausó, el rango horario con el total de minutos entre
 * paréntesis y un botón de borrar al final.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Trash2, User } from "lucide-react";

export interface PausaItem {
  id: string;
  motivo: string;
  inicio: string; // ISO
  fin: string | null; // ISO
  usuario: string | null;
  /** Duración en minutos (usa el override manual si existe). null si está abierta. */
  durMin: number | null;
}

export function PausasListClient({
  pausas,
  puedeEliminar,
}: {
  pausas: PausaItem[];
  puedeEliminar: boolean;
}) {
  const router = useRouter();
  const [borrandoId, setBorrandoId] = React.useState<string | null>(null);

  const borrar = async (id: string) => {
    if (!confirm("¿Eliminar esta pausa?")) return;
    setBorrandoId(id);
    const res = await fetch(`/api/pausas/${id}`, { method: "DELETE" });
    setBorrandoId(null);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(typeof data.error === "string" ? data.error : "No se pudo eliminar.");
    }
  };

  return (
    <ul className="space-y-2 text-sm">
      {pausas.map((p) => (
        <li key={p.id} className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-slate-800 truncate">{p.motivo}</p>
            {p.usuario && (
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <User className="h-3 w-3" /> {p.usuario}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-slate-500 tabular-nums">
              {formatHora(p.inicio)} → {p.fin ? formatHora(p.fin) : "abierta"}
              {p.durMin != null && (
                <span className="ml-1 font-semibold text-slate-700">({p.durMin} min)</span>
              )}
            </span>
            {puedeEliminar && (
              <button
                onClick={() => borrar(p.id)}
                disabled={borrandoId === p.id}
                className="rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                aria-label="Eliminar pausa"
                title="Eliminar pausa"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
