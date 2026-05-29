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
  XCircle,
} from "lucide-react";

export interface OrdenView {
  id: string;
  numero: number;
  estado: "PENDIENTE" | "EN_CURSO" | "FINALIZADO" | "CANCELADO";
  tipo: "LAVADO" | "PINTURA";
  color: string;
  cantidad: number;
  cantidadCompletada: number;
  inicioTeorico: string;
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
              <li key={o.id} className="flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50 gap-2 sm:gap-3">
                <Link href={`/dashboard/ordenes/${o.id}`} className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
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
                      {o.tipo === "PINTURA" && ` · ${o.color}`}
                    </p>
                    <p className="text-sm font-medium text-slate-700">
                      {formatRango(o.inicioTeorico, o.finTeorico)}
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

// En celular: solo ícono (un poco más grande). Desde sm: ícono + texto.
function EstadoBadge({ estado }: { estado: OrdenView["estado"] }) {
  const cfg = {
    EN_CURSO: { bg: "bg-blue-100", text: "text-blue-800", icon: Clock, label: "En curso" },
    FINALIZADO: { bg: "bg-emerald-100", text: "text-emerald-800", icon: CheckCircle2, label: "Finalizado" },
    CANCELADO: { bg: "bg-slate-200", text: "text-slate-600", icon: XCircle, label: "Cancelado" },
    PENDIENTE: { bg: "bg-amber-100", text: "text-amber-800", icon: AlertCircle, label: "Pendiente" },
  }[estado];
  const Icon = cfg.icon;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full p-2 sm:px-3 sm:py-1 text-sm font-medium whitespace-nowrap " +
        `${cfg.bg} ${cfg.text}`
      }
      title={cfg.label}
    >
      <Icon className="h-5 w-5 sm:h-4 sm:w-4" />
      <span className="hidden sm:inline">{cfg.label}</span>
    </span>
  );
}

function TipoBadge({ tipo }: { tipo: "LAVADO" | "PINTURA" }) {
  const lavado = tipo === "LAVADO";
  const Icon = lavado ? Droplets : Paintbrush;
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full p-2 sm:px-2 sm:py-0.5 text-xs font-bold uppercase tracking-wide whitespace-nowrap " +
        (lavado ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800")
      }
      title={lavado ? "Lavado" : "Pintura"}
    >
      <Icon className="h-5 w-5 sm:h-3 sm:w-3" />
      <span className="hidden sm:inline">{lavado ? "Lavado" : "Pintura"}</span>
    </span>
  );
}

/** Formatea el rango inicio→fin. Si es el mismo día, omite la fecha del fin. */
function formatRango(inicioISO: string, finISO: string): string {
  const inicio = new Date(inicioISO);
  const fin = new Date(finISO);
  const fecha = (d: Date) => d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
  const hora = (d: Date) => d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const mismoDia =
    inicio.getFullYear() === fin.getFullYear() &&
    inicio.getMonth() === fin.getMonth() &&
    inicio.getDate() === fin.getDate();
  return mismoDia
    ? `${fecha(inicio)} ${hora(inicio)} → ${hora(fin)}`
    : `${fecha(inicio)} ${hora(inicio)} → ${fecha(fin)} ${hora(fin)}`;
}
