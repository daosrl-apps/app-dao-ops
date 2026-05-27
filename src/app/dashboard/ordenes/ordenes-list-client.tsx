"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Droplets,
  GitBranch,
  Paintbrush,
  Trash2,
} from "lucide-react";

export interface OrdenView {
  id: string;
  numero: number;
  estado: "PENDIENTE" | "EN_CURSO" | "FINALIZADO" | "CANCELADO";
  tipo: "LAVADO" | "PINTURA";
  color: string;
  cantidad: number;
  cantidadCompletada: number;
  inicioProgramado: string;
  finTeorico: string;
  creadoPor: string;
  articulo: { codigo: string; descripcion: string | null; cliente: string };
  esContinuacion: boolean;
}

export function OrdenesListClient({
  items,
  esAdmin,
}: {
  items: OrdenView[];
  esAdmin: boolean;
}) {
  const router = useRouter();
  const [borrando, setBorrando] = React.useState(false);
  const [borrandoId, setBorrandoId] = React.useState<string | null>(null);

  const borrarTodas = async () => {
    if (!confirm(`¿Borrar TODAS las órdenes de trabajo? Esta acción no se puede deshacer.`)) return;
    setBorrando(true);
    const res = await fetch("/api/ordenes", { method: "DELETE" });
    setBorrando(false);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(typeof data.error === "string" ? data.error : "No se pudo borrar.");
    }
  };

  const borrarUna = async (id: string) => {
    if (!confirm("¿Borrar esta orden?")) return;
    setBorrandoId(id);
    const res = await fetch(`/api/ordenes/${id}`, { method: "DELETE" });
    setBorrandoId(null);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(typeof data.error === "string" ? data.error : "No se pudo borrar.");
    }
  };

  return (
    <>
      {esAdmin && items.length > 0 && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={borrarTodas}
            disabled={borrando}
            className="inline-flex items-center gap-2 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {borrando ? "Borrando…" : "Borrar todas las órdenes"}
          </button>
        </div>
      )}

      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        {items.length === 0 ? (
          <p className="p-6 text-slate-500">Todavía no hay órdenes cargadas.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((o) => (
              <li key={o.id} className="flex items-center justify-between p-5 hover:bg-slate-50 gap-3">
                <Link href={`/dashboard/ordenes/${o.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                  <EstadoBadge estado={o.estado} />
                  <TipoBadge tipo={o.tipo} />
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-black text-slate-900 truncate tracking-tight">
                      #{o.numero} · {o.articulo.descripcion?.trim() || o.articulo.codigo}
                      {o.esContinuacion && (
                        <span title="Continuación de otra OT" className="ml-2 inline-flex items-center text-amber-600">
                          <GitBranch className="h-4 w-4 inline" />
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-slate-600">
                      <b>{o.articulo.cliente}</b> · {o.cantidad} pzs
                      {o.tipo === "PINTURA" && ` · ${o.color}`} ·{" "}
                      {new Date(o.inicioProgramado).toLocaleString("es-AR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={() => borrarUna(o.id)}
                  disabled={borrandoId === o.id || o.estado === "EN_CURSO"}
                  className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Borrar"
                  title={o.estado === "EN_CURSO" ? "No se puede borrar una OT en curso" : "Borrar"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function EstadoBadge({ estado }: { estado: OrdenView["estado"] }) {
  if (estado === "EN_CURSO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800 whitespace-nowrap">
        <Clock className="h-4 w-4" /> En curso
      </span>
    );
  }
  if (estado === "FINALIZADO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 whitespace-nowrap">
        <CheckCircle2 className="h-4 w-4" /> Finalizado
      </span>
    );
  }
  if (estado === "CANCELADO") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-3 py-1 text-sm font-medium text-slate-600 whitespace-nowrap">
        Cancelado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 whitespace-nowrap">
      <AlertCircle className="h-4 w-4" /> Pendiente
    </span>
  );
}

function TipoBadge({ tipo }: { tipo: "LAVADO" | "PINTURA" }) {
  const lavado = tipo === "LAVADO";
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap " +
        (lavado ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800")
      }
    >
      {lavado ? <Droplets className="h-3 w-3" /> : <Paintbrush className="h-3 w-3" />}
      {lavado ? "Lavado" : "Pintura"}
    </span>
  );
}
