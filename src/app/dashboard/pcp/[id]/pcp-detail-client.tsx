"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Droplets, Lock, Paintbrush, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ItemView {
  id: string;
  orden: number;
  tipo: "LAVADO" | "PINTURA";
  estado: "PENDIENTE" | "EN_CURSO" | "FINALIZADO";
  color: string;
  cantidad: number;
  piezasPorPercha: number | null;
  velocidadLavado: number | null;
  inicioTeorico: string;
  finTeorico: string;
  inicioReal: string | null;
  finReal: string | null;
  articulo: {
    codigo: string;
    descripcion: string | null;
    cliente: { nombre: string };
  };
}

export function PcpDetailClient({
  pcpId,
  inicio,
  creadoPor,
  ordenManual,
  items: itemsInicial,
  puedeEditar,
}: {
  pcpId: string;
  inicio: string;
  creadoPor: string;
  ordenManual: boolean;
  items: ItemView[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = React.useState<ItemView[]>(itemsInicial);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const swap = (i: number, j: number) => {
    if (j < 0 || j >= items.length) return;
    // No permitir mover items no-PENDIENTE (ni a ellos, ni sobre ellos).
    if (items[i].estado !== "PENDIENTE" || items[j].estado !== "PENDIENTE") return;
    setItems((curr) => {
      const next = [...curr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setDirty(true);
  };

  const guardar = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/pcp/${pcpId}/reorder`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ordenIds: items.map((i) => i.id) }),
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "No se pudo guardar.");
      // Revertir a estado del server.
      setItems(itemsInicial);
    }
  };

  const cancelar = () => {
    setItems(itemsInicial);
    setDirty(false);
    setError(null);
  };

  const inicioDate = new Date(inicio);

  return (
    <section className="mx-auto w-full max-w-5xl p-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            PCP del{" "}
            {inicioDate.toLocaleDateString("es-AR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </h1>
          <p className="text-slate-600 mt-1">
            Inicio teórico:{" "}
            <b>
              {inicioDate.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </b>{" "}
            · creado por {creadoPor} · {items.length} ítem(s) · orden{" "}
            <b>{ordenManual ? "manual" : "automático"}</b>
          </p>
        </div>
        {puedeEditar && dirty && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={cancelar} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={guardar}
              disabled={saving}
              className="bg-emerald-600 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Guardando…" : "Guardar orden"}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 border border-red-200 p-3 text-red-800">
          {error}
        </p>
      )}

      <ol className="space-y-3">
        {items.map((it, idx) => (
          <ItemRow
            key={it.id}
            item={it}
            idx={idx}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
            puedeEditar={puedeEditar}
            onUp={() => swap(idx, idx - 1)}
            onDown={() => swap(idx, idx + 1)}
          />
        ))}
      </ol>
    </section>
  );
}

function ItemRow({
  item,
  idx,
  isFirst,
  isLast,
  puedeEditar,
  onUp,
  onDown,
}: {
  item: ItemView;
  idx: number;
  isFirst: boolean;
  isLast: boolean;
  puedeEditar: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const isLavado = item.tipo === "LAVADO";
  const isPendiente = item.estado === "PENDIENTE";

  return (
    <li className="flex items-stretch rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      {puedeEditar && (
        <div className="flex flex-col bg-slate-50 border-r border-slate-200 w-12">
          {isPendiente ? (
            <>
              <button
                onClick={onUp}
                disabled={isFirst}
                className="h-1/2 hover:bg-slate-200 disabled:opacity-30 flex items-center justify-center"
                aria-label="Subir"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
              <button
                onClick={onDown}
                disabled={isLast}
                className="h-1/2 hover:bg-slate-200 disabled:opacity-30 border-t border-slate-200 flex items-center justify-center"
                aria-label="Bajar"
              >
                <ArrowDown className="h-5 w-5" />
              </button>
            </>
          ) : (
            <div
              className="h-full flex items-center justify-center text-slate-400"
              title="Ítem en curso o finalizado: no se puede reordenar"
            >
              <Lock className="h-4 w-4" />
            </div>
          )}
        </div>
      )}
      <div className="flex-1 p-5">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-xs text-slate-400 font-medium">#{idx + 1}</span>
          <span
            className={
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide " +
              (isLavado ? "bg-sky-100 text-sky-800" : "bg-violet-100 text-violet-800")
            }
          >
            {isLavado ? <Droplets className="h-3 w-3" /> : <Paintbrush className="h-3 w-3" />}
            {isLavado ? "Lavado" : "Pintura"}
          </span>
          <EstadoBadge estado={item.estado} />
          <span className="text-xs uppercase tracking-wider text-slate-500">
            {item.articulo.cliente.nombre}
          </span>
        </div>
        <p className="text-2xl font-black text-slate-900 tracking-tight leading-tight">
          {item.articulo.descripcion?.trim() || item.articulo.codigo}
        </p>
        <p className="mt-1 text-sm font-medium text-slate-600">
          {item.cantidad} pzs
          {!isLavado && <> · {item.color}</>}
          {isLavado && (
            <>
              {" "}
              · {item.piezasPorPercha}/percha · {item.velocidadLavado} m/s
            </>
          )}
        </p>
        <div className="mt-2 text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
          <span>
            Plan:{" "}
            <b>
              {formatHora(item.inicioTeorico)} → {formatHora(item.finTeorico)}
            </b>
          </span>
          {(item.inicioReal || item.finReal) && (
            <span>
              Real:{" "}
              <b>
                {item.inicioReal ? formatHora(item.inicioReal) : "—"} →{" "}
                {item.finReal ? formatHora(item.finReal) : "—"}
              </b>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}

function EstadoBadge({ estado }: { estado: ItemView["estado"] }) {
  const cfg = {
    PENDIENTE: { bg: "bg-amber-100", text: "text-amber-800", label: "Pendiente" },
    EN_CURSO: { bg: "bg-blue-100", text: "text-blue-800", label: "En curso" },
    FINALIZADO: { bg: "bg-emerald-100", text: "text-emerald-800", label: "Finalizado" },
  }[estado];
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${cfg.bg} ${cfg.text}`}
    >
      {cfg.label}
    </span>
  );
}

function formatHora(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
