"use client";

/**
 * Vista del operario: muestra la OT en curso, con timer decreciente y
 * controles de PAUSAR/REANUDAR y FINALIZAR.
 *
 * Polling cada 2 s para refrescar el snapshot tras acciones de otros dispositivos.
 * El timer local tickea cada 1 s a partir del snapshot + drift de reloj
 * (`serverNow`) para evitar saltos cuando el reloj del cliente desincroniza.
 */
import * as React from "react";
import Link from "next/link";
import {
  Pause,
  Play,
  CheckCircle2,
  LogOut,
  Home,
  Droplets,
  Paintbrush,
  Clock,
  CalendarDays,
  X,
} from "lucide-react";
import type { LineaSnapshot, LineaOrden, LineaAgenda } from "@/lib/linea";

const POLL_MS = 2000;

export function OperarioClient({ userName, role }: { userName: string; role: string }) {
  const [snapshot, setSnapshot] = React.useState<LineaSnapshot | null>(null);
  const [now, setNow] = React.useState<number>(() => Date.now());
  const [mostrandoPausa, setMostrandoPausa] = React.useState(false);
  const [motivoPausa, setMotivoPausa] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  // Finalizar: modal de cantidad completada + flujo de justificación de desvío.
  const [finalizarOpen, setFinalizarOpen] = React.useState(false);
  const [cantidadCompletada, setCantidadCompletada] = React.useState("");
  const [justificacion, setJustificacion] = React.useState<
    { deltaPct: number; cantidadFinal: number } | null
  >(null);
  const [justificacionTexto, setJustificacionTexto] = React.useState("");
  // Editar minutos de la última pausa (solo supervisor / admin).
  const [editarMinutosOpen, setEditarMinutosOpen] = React.useState(false);
  const [minutosEdit, setMinutosEdit] = React.useState("");
  // Agenda: lista (solo lectura) de OTs de hoy y mañana.
  const [agendaOpen, setAgendaOpen] = React.useState(false);
  const [agenda, setAgenda] = React.useState<LineaAgenda | null>(null);
  const [agendaLoading, setAgendaLoading] = React.useState(false);

  const esSupervisor = role === "ADMIN" || role === "SUPERVISOR";

  const fetchSnapshot = React.useCallback(async () => {
    const res = await fetch("/api/linea/actual", { cache: "no-store" });
    if (!res.ok) return;
    setSnapshot(await res.json());
  }, []);

  React.useEffect(() => {
    fetchSnapshot();
    const t = setInterval(fetchSnapshot, POLL_MS);
    return () => clearInterval(t);
  }, [fetchSnapshot]);

  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const iniciar = async () => {
    setSubmitting(true);
    await fetch("/api/linea/iniciar", { method: "POST" });
    await fetchSnapshot();
    setSubmitting(false);
  };

  const pausarConfirmar = async () => {
    if (!motivoPausa.trim()) return;
    setSubmitting(true);
    await fetch("/api/linea/pausar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ motivo: motivoPausa.trim() }),
    });
    setMostrandoPausa(false);
    setMotivoPausa("");
    await fetchSnapshot();
    setSubmitting(false);
  };

  const reanudar = async () => {
    setSubmitting(true);
    await fetch("/api/linea/reanudar", { method: "POST" });
    await fetchSnapshot();
    setSubmitting(false);
  };

  const abrirAgenda = async () => {
    setAgendaOpen(true);
    setAgendaLoading(true);
    const res = await fetch("/api/linea/agenda", { cache: "no-store" });
    if (res.ok) setAgenda(await res.json());
    setAgendaLoading(false);
  };

  const actual = snapshot?.ordenActual ?? null;
  const enPausa = !!actual?.pausaActiva;
  const enCurso = actual?.estado === "EN_CURSO";

  const abrirFinalizar = () => {
    setCantidadCompletada(String(actual?.cantidad ?? ""));
    setFinalizarOpen(true);
  };

  // Envía finalizar; maneja el 409 de justificación abriendo el modal de texto.
  const enviarFinalizar = async (cantidad: number, observaciones?: string) => {
    setSubmitting(true);
    const res = await fetch("/api/linea/finalizar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cantidadCompletada: cantidad,
        ...(observaciones ? { observaciones } : {}),
      }),
    });
    if (res.status === 409) {
      const data = await res.json().catch(() => null);
      if (data?.needsJustificacion) {
        setFinalizarOpen(false);
        setJustificacion({ deltaPct: data.deltaPct, cantidadFinal: data.cantidadFinal });
        setSubmitting(false);
        return;
      }
    }
    setFinalizarOpen(false);
    setJustificacion(null);
    setJustificacionTexto("");
    setCantidadCompletada("");
    await fetchSnapshot();
    setSubmitting(false);
  };

  const confirmarFinalizar = () => {
    const c = parseInt(cantidadCompletada, 10);
    if (!Number.isFinite(c) || c <= 0 || c > (actual?.cantidad ?? 0)) return;
    enviarFinalizar(c);
  };

  const confirmarJustificacion = () => {
    if (!justificacion || !justificacionTexto.trim()) return;
    enviarFinalizar(justificacion.cantidadFinal, justificacionTexto.trim());
  };

  const abrirEditarMinutos = () => {
    const dur = actual?.ultimaPausaCerrada?.durSeg ?? 0;
    setMinutosEdit(String(Math.round(dur / 60)));
    setEditarMinutosOpen(true);
  };

  const confirmarEditarMinutos = async () => {
    if (!actual?.ultimaPausaCerrada) return;
    const m = parseInt(minutosEdit, 10);
    if (!Number.isFinite(m) || m < 0) return;
    setSubmitting(true);
    await fetch(`/api/pausas/${actual.ultimaPausaCerrada.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutos: m }),
    });
    setEditarMinutosOpen(false);
    await fetchSnapshot();
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-900 text-white">
      <header className="flex items-center justify-between bg-slate-800 px-6 py-3">
        <div>
          <p className="text-base font-medium">{userName}</p>
          <p className="text-xs text-slate-400">{rolLabel(role)} · línea</p>
        </div>
        <div className="flex gap-2">
          {role !== "OPERARIO" && (
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-600 px-4 text-base hover:bg-slate-700"
            >
              <Home className="h-5 w-5" /> Dashboard
            </Link>
          )}
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="inline-flex h-12 items-center gap-2 rounded-xl border border-slate-600 px-4 text-base hover:bg-slate-700"
            >
              <LogOut className="h-5 w-5" /> Salir
            </button>
          </form>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col items-center justify-center gap-8">
        {!snapshot ? (
          <p className="text-2xl text-slate-400">Cargando…</p>
        ) : !actual ? (
          <NoHayOrden />
        ) : !enCurso ? (
          <OrdenPendiente item={actual} onIniciar={iniciar} submitting={submitting} />
        ) : (
          <OrdenEnCurso
            item={actual}
            now={now}
            serverNow={new Date(snapshot.serverNow).getTime()}
            enPausa={enPausa}
          />
        )}

        <div className="flex flex-col gap-3 w-full max-w-2xl items-center">
          {enCurso && (
            <div className="flex flex-wrap gap-4 w-full justify-center">
              {enPausa ? (
                <button
                  onClick={reanudar}
                  disabled={submitting}
                  className="h-24 flex-1 min-w-[200px] rounded-2xl bg-amber-500 hover:bg-amber-600 text-2xl font-bold text-slate-900 flex items-center justify-center gap-3 shadow-lg active:scale-95 transition"
                >
                  <Play className="h-8 w-8" /> Reanudar
                </button>
              ) : (
                <button
                  onClick={() => setMostrandoPausa(true)}
                  disabled={submitting}
                  className="h-24 flex-1 min-w-[200px] rounded-2xl bg-slate-200 hover:bg-slate-300 text-2xl font-bold text-slate-900 flex items-center justify-center gap-3 shadow-lg active:scale-95 transition"
                >
                  <Pause className="h-8 w-8" /> Pausar
                </button>
              )}
              <button
                onClick={abrirFinalizar}
                disabled={submitting}
                className="h-24 flex-1 min-w-[200px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-2xl font-bold text-white flex items-center justify-center gap-3 shadow-lg active:scale-95 transition"
              >
                <CheckCircle2 className="h-8 w-8" /> Finalizar
              </button>
            </div>
          )}
          {/* Siempre visible: ver las OTs de hoy y mañana (solo lectura). */}
          <button
            onClick={abrirAgenda}
            className="h-24 w-full rounded-2xl bg-[#1627b1] hover:bg-[#1e30d4] text-2xl font-bold text-white flex items-center justify-center gap-3 shadow-lg active:scale-95 transition"
          >
            <CalendarDays className="h-8 w-8" /> Órdenes de hoy y mañana
          </button>
          {/* Supervisor/admin: corregir los minutos de la última pausa cerrada. */}
          {enCurso && esSupervisor && !enPausa && actual?.ultimaPausaCerrada && (
            <button
              onClick={abrirEditarMinutos}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-600 px-5 h-12 text-base font-medium text-slate-200 hover:bg-slate-800"
            >
              <Clock className="h-5 w-5" /> Editar minutos de pausa
            </button>
          )}
        </div>
      </main>

      {mostrandoPausa && (
        <PausaDialog
          motivo={motivoPausa}
          onMotivo={setMotivoPausa}
          onCancel={() => {
            setMostrandoPausa(false);
            setMotivoPausa("");
          }}
          onConfirm={pausarConfirmar}
          submitting={submitting}
        />
      )}

      {finalizarOpen && actual && (
        <FinalizarDialog
          cantidadTotal={actual.cantidad}
          cantidad={cantidadCompletada}
          onCantidad={setCantidadCompletada}
          onCancel={() => setFinalizarOpen(false)}
          onConfirm={confirmarFinalizar}
          submitting={submitting}
        />
      )}

      {justificacion && (
        <JustificacionDialog
          deltaPct={justificacion.deltaPct}
          texto={justificacionTexto}
          onTexto={setJustificacionTexto}
          onCancel={() => {
            setJustificacion(null);
            setJustificacionTexto("");
          }}
          onConfirm={confirmarJustificacion}
          submitting={submitting}
        />
      )}

      {editarMinutosOpen && (
        <EditarMinutosDialog
          minutos={minutosEdit}
          onMinutos={setMinutosEdit}
          onCancel={() => setEditarMinutosOpen(false)}
          onConfirm={confirmarEditarMinutos}
          submitting={submitting}
        />
      )}

      {agendaOpen && (
        <AgendaDialog
          agenda={agenda}
          loading={agendaLoading}
          actualId={actual?.id ?? null}
          onClose={() => setAgendaOpen(false)}
        />
      )}
    </div>
  );
}

function rolLabel(r: string) {
  if (r === "ADMIN") return "Administrador";
  if (r === "SUPERVISOR") return "Supervisor";
  return "Operario";
}

function NoHayOrden() {
  return (
    <div className="text-center">
      <p className="text-3xl font-bold mb-2">No hay órdenes en cola</p>
      <p className="text-slate-400 text-lg">
        Esperá a que el supervisor cargue una OT.
      </p>
    </div>
  );
}

function OrdenPendiente({
  item,
  onIniciar,
  submitting,
}: {
  item: LineaOrden;
  onIniciar: () => void;
  submitting: boolean;
}) {
  return (
    <div className="text-center max-w-3xl w-full">
      <p className="uppercase tracking-wider text-slate-400 text-sm mb-2">Próxima orden</p>
      <TipoBadge tipo={item.tipo} grande />
      <h1 className="text-5xl md:text-6xl font-black tracking-tight leading-tight mt-3 mb-2">
        {item.cliente.nombre}
      </h1>
      <p className="text-3xl md:text-4xl font-black text-slate-100 tracking-tight mb-3">
        {nombreOrden(item)}
      </p>
      <p className="text-2xl font-bold text-slate-300 mb-8">
        {item.cantidad} piezas
        {item.tipo === "PINTURA" && ` · ${item.color}`}
        {item.tipo === "LAVADO" &&
          item.piezasPorPercha != null &&
          item.velocidadLavado != null &&
          ` · ${item.piezasPorPercha}/percha · ${item.velocidadLavado} m/min`}
      </p>
      <button
        onClick={onIniciar}
        disabled={submitting}
        className="h-24 px-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-3xl font-bold shadow-lg active:scale-95 transition inline-flex items-center gap-3"
      >
        <Play className="h-8 w-8" /> Iniciar trabajo
      </button>
    </div>
  );
}

function OrdenEnCurso({
  item,
  now,
  serverNow,
  enPausa,
}: {
  item: LineaOrden;
  now: number;
  serverNow: number;
  enPausa: boolean;
}) {
  // Ajustar drift de reloj entre cliente y servidor.
  const drift = serverNow - now;
  const ahoraServer = now + drift;
  const inicioRealMs = item.inicioReal ? new Date(item.inicioReal).getTime() : ahoraServer;
  const pausaActivaInicioMs = item.pausaActiva
    ? new Date(item.pausaActiva.inicio).getTime()
    : null;
  const finCorteMs = pausaActivaInicioMs ?? ahoraServer;

  // Tiempo trabajado: elapsed total - pausas finalizadas - pausa activa (si hay).
  const trabajadoMs = finCorteMs - inicioRealMs - item.pausasFinalizadasMs;
  const restanteMs = item.duracionTeoricaSeg * 1000 - trabajadoMs;
  const sobretiempo = restanteMs < 0;
  const display = formatHHMMSS(Math.abs(restanteMs));

  return (
    <div className="w-full max-w-4xl">
      <div className="rounded-3xl bg-black text-white border-4 border-emerald-500/30 p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <p className="uppercase tracking-widest text-emerald-400 text-sm">En línea</p>
          <TipoBadge tipo={item.tipo} grande />
        </div>
        <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-tight">
          {item.cliente.nombre}
        </h1>
        <p className="text-3xl md:text-4xl font-black mt-2 text-slate-100 tracking-tight">
          {nombreOrden(item)}
        </p>
        {item.tipo === "PINTURA" && (
          <p className="text-2xl md:text-3xl font-bold text-slate-300 mt-1">{item.color}</p>
        )}
        {item.tipo === "LAVADO" &&
          item.piezasPorPercha != null &&
          item.velocidadLavado != null && (
            <p className="text-2xl md:text-3xl font-bold text-slate-300 mt-1">
              {item.piezasPorPercha}/percha · {item.velocidadLavado} m/min
            </p>
          )}
        <p className="text-xl font-semibold text-slate-400 mt-1">{item.cantidad} piezas</p>

        <div
          className={
            "mt-6 font-mono tabular-nums text-7xl md:text-9xl font-black tracking-wider " +
            (sobretiempo
              ? "text-red-500 animate-[blink_1s_step-end_infinite]"
              : enPausa
                ? "text-amber-300"
                : "text-yellow-400")
          }
          aria-live="polite"
        >
          {sobretiempo && "+"}
          {display}
        </div>
        <p className="text-slate-400 text-base mt-2">
          {enPausa
            ? "Pausado"
            : sobretiempo
              ? "Sobretiempo — tarea aún no finalizada"
              : "Tiempo restante estimado"}
        </p>
      </div>
    </div>
  );
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

/** Texto principal del ítem: descripción si existe, si no el código. */
function nombreOrden(item: LineaOrden) {
  return item.articulo.descripcion?.trim() || item.articulo.codigo;
}

function TipoBadge({ tipo, grande }: { tipo: "LAVADO" | "PINTURA"; grande?: boolean }) {
  const lavado = tipo === "LAVADO";
  const size = grande ? "text-lg px-4 py-1.5" : "text-sm px-2.5 py-1";
  return (
    <span
      className={
        `inline-flex items-center gap-2 rounded-full font-bold uppercase tracking-wide ${size} ` +
        (lavado ? "bg-sky-200 text-sky-900" : "bg-violet-200 text-violet-900")
      }
    >
      {lavado ? <Droplets className="h-5 w-5" /> : <Paintbrush className="h-5 w-5" />}
      {lavado ? "Lavado" : "Pintura"}
    </span>
  );
}

function PausaDialog({
  motivo,
  onMotivo,
  onCancel,
  onConfirm,
  submitting,
}: {
  motivo: string;
  onMotivo: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-2xl font-bold mb-3">¿Por qué pausás?</h2>
        <p className="text-slate-600 mb-4">
          El motivo queda registrado en el historial.
        </p>
        <textarea
          autoFocus
          value={motivo}
          onChange={(e) => onMotivo(e.target.value)}
          className="w-full min-h-[120px] rounded-xl border border-slate-300 p-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#1627b1]"
          placeholder="Ej: cambio de color, falta de piezas, mantenimiento…"
        />
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="h-14 px-6 rounded-xl border border-slate-300 text-lg font-medium hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!motivo.trim() || submitting}
            className="h-14 px-6 rounded-xl bg-[#1627b1] text-white text-lg font-medium disabled:opacity-50"
          >
            {submitting ? "Pausando…" : "Confirmar pausa"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FinalizarDialog({
  cantidadTotal,
  cantidad,
  onCantidad,
  onCancel,
  onConfirm,
  submitting,
}: {
  cantidadTotal: number;
  cantidad: string;
  onCantidad: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const c = parseInt(cantidad, 10);
  const valido = Number.isFinite(c) && c > 0 && c <= cantidadTotal;
  const esParcial = valido && c < cantidadTotal;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-2xl font-bold mb-3">Finalizar orden</h2>
        <p className="text-slate-600 mb-4">
          ¿Se completó la totalidad? Si terminás con menos piezas, el remanente se
          agenda como una nueva OT al final de la cola.
        </p>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Piezas completadas (de {cantidadTotal})
        </label>
        <input
          type="number"
          min={1}
          max={cantidadTotal}
          autoFocus
          value={cantidad}
          onChange={(e) => onCantidad(e.target.value)}
          className="w-full rounded-xl border border-slate-300 p-4 text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1627b1]"
        />
        {esParcial && (
          <p className="mt-2 text-sm text-amber-700">
            Quedan {cantidadTotal - c} piezas → se crea una OT continuación.
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="h-14 px-6 rounded-xl border border-slate-300 text-lg font-medium hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!valido || submitting}
            className="h-14 px-6 rounded-xl bg-emerald-600 text-white text-lg font-medium disabled:opacity-50"
          >
            {submitting ? "Finalizando…" : esParcial ? "Finalizar y splitear" : "Finalizar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function JustificacionDialog({
  deltaPct,
  texto,
  onTexto,
  onCancel,
  onConfirm,
  submitting,
}: {
  deltaPct: number;
  texto: string;
  onTexto: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const tarde = deltaPct > 0;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-2xl font-bold mb-2">Justificá el desvío</h2>
        <p className="text-slate-600 mb-4">
          El tiempo real se desvió{" "}
          <b className={tarde ? "text-red-600" : "text-emerald-600"}>
            {tarde ? "+" : ""}
            {deltaPct}%
          </b>{" "}
          respecto del estimado. Indicá el motivo (queda en las observaciones de la OT).
        </p>
        <textarea
          autoFocus
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          className="w-full min-h-[120px] rounded-xl border border-slate-300 p-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#1627b1]"
          placeholder="Ej: demora por falta de piezas, secado más lento, etc."
        />
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="h-14 px-6 rounded-xl border border-slate-300 text-lg font-medium hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!texto.trim() || submitting}
            className="h-14 px-6 rounded-xl bg-emerald-600 text-white text-lg font-medium disabled:opacity-50"
          >
            {submitting ? "Finalizando…" : "Guardar y finalizar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditarMinutosDialog({
  minutos,
  onMinutos,
  onCancel,
  onConfirm,
  submitting,
}: {
  minutos: string;
  onMinutos: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
}) {
  const m = parseInt(minutos, 10);
  const valido = Number.isFinite(m) && m >= 0;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-md p-6 shadow-2xl">
        <h2 className="text-2xl font-bold mb-3">Editar minutos de pausa</h2>
        <p className="text-slate-600 mb-4">
          Corregí la duración registrada de la última pausa.
        </p>
        <label className="block text-sm font-medium text-slate-700 mb-1">Minutos</label>
        <input
          type="number"
          min={0}
          autoFocus
          value={minutos}
          onChange={(e) => onMinutos(e.target.value)}
          className="w-full rounded-xl border border-slate-300 p-4 text-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-[#1627b1]"
        />
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="h-14 px-6 rounded-xl border border-slate-300 text-lg font-medium hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!valido || submitting}
            className="h-14 px-6 rounded-xl bg-[#1627b1] text-white text-lg font-medium disabled:opacity-50"
          >
            {submitting ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Hora HH:MM en zona horaria de Argentina (independiente del reloj del móvil). */
function horaCorta(iso: string) {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

/** Panel de solo lectura con las OTs de hoy y mañana, pensado para el móvil. */
function AgendaDialog({
  agenda,
  loading,
  actualId,
  onClose,
}: {
  agenda: LineaAgenda | null;
  loading: boolean;
  actualId: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-slate-900 text-white flex flex-col z-50">
      <header className="flex items-center justify-between bg-slate-800 px-6 py-4 shrink-0">
        <h2 className="text-2xl font-bold flex items-center gap-3">
          <CalendarDays className="h-7 w-7" /> Órdenes de trabajo
        </h2>
        <button
          onClick={onClose}
          className="inline-flex h-14 items-center gap-2 rounded-xl border border-slate-600 px-5 text-lg font-medium hover:bg-slate-700 active:scale-95 transition"
        >
          <X className="h-6 w-6" /> Cerrar
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {loading || !agenda ? (
          <p className="text-2xl text-slate-400 text-center mt-12">Cargando…</p>
        ) : (
          <>
            <AgendaSeccion titulo="Hoy" items={agenda.hoy} actualId={actualId} />
            <AgendaSeccion titulo="Mañana" items={agenda.manana} actualId={actualId} />
          </>
        )}
      </div>
    </div>
  );
}

function AgendaSeccion({
  titulo,
  items,
  actualId,
}: {
  titulo: string;
  items: LineaOrden[];
  actualId: string | null;
}) {
  return (
    <section>
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 mb-3">
        {titulo} · {items.length} {items.length === 1 ? "orden" : "órdenes"}
      </h3>
      {items.length === 0 ? (
        <p className="text-lg text-slate-500">Sin órdenes programadas.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <AgendaItem key={it.id} item={it} esActual={it.id === actualId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgendaItem({ item, esActual }: { item: LineaOrden; esActual: boolean }) {
  return (
    <li
      className={
        "rounded-2xl p-4 flex items-center gap-4 border " +
        (esActual
          ? "bg-emerald-950/60 border-emerald-500"
          : "bg-slate-800 border-slate-700")
      }
    >
      <div className="text-3xl font-black tabular-nums tracking-tight shrink-0 w-20">
        {horaCorta(item.inicioProgramado)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <TipoBadge tipo={item.tipo} />
          <EstadoBadge estado={item.estado} />
        </div>
        <p className="text-2xl font-black truncate mt-1">{item.cliente.nombre}</p>
        <p className="text-lg font-bold text-slate-300 truncate">{nombreOrden(item)}</p>
        <p className="text-base text-slate-400">
          {item.cantidad} piezas
          {item.tipo === "PINTURA" && ` · ${item.color}`}
        </p>
      </div>
    </li>
  );
}

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    EN_CURSO: "bg-emerald-200 text-emerald-900",
    PENDIENTE: "bg-amber-200 text-amber-900",
    FINALIZADO: "bg-slate-300 text-slate-700",
  };
  const label: Record<string, string> = {
    EN_CURSO: "En curso",
    PENDIENTE: "Pendiente",
    FINALIZADO: "Finalizada",
  };
  return (
    <span
      className={
        "inline-flex items-center rounded-full font-bold uppercase tracking-wide text-xs px-2.5 py-1 " +
        (map[estado] ?? "bg-slate-300 text-slate-700")
      }
    >
      {label[estado] ?? estado}
    </span>
  );
}
