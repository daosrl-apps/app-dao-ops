"use client";

/**
 * Vista del operario: muestra el ítem en curso, con timer decreciente y
 * controles de PAUSAR/REANUDAR y FINALIZAR.
 *
 * Polling cada 2 s para refrescar el snapshot tras acciones de otros dispositivos.
 * El timer local tickea cada 1 s a partir del snapshot + drift de reloj
 * (`serverNow`) para evitar saltos cuando el reloj del cliente desincroniza.
 */
import * as React from "react";
import Link from "next/link";
import { Pause, Play, CheckCircle2, LogOut, Home } from "lucide-react";
import type { LineaSnapshot, LineaItem } from "@/lib/linea";

const POLL_MS = 2000;

export function OperarioClient({ userName, role }: { userName: string; role: string }) {
  const [snapshot, setSnapshot] = React.useState<LineaSnapshot | null>(null);
  const [now, setNow] = React.useState<number>(() => Date.now());
  const [mostrandoPausa, setMostrandoPausa] = React.useState(false);
  const [motivoPausa, setMotivoPausa] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

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

  const finalizar = async () => {
    if (!confirm("¿Finalizar la orden en curso?")) return;
    setSubmitting(true);
    await fetch("/api/linea/finalizar", { method: "POST" });
    await fetchSnapshot();
    setSubmitting(false);
  };

  const actual = snapshot?.itemActual ?? null;
  const enPausa = !!actual?.pausaActiva;
  const enCurso = actual?.estado === "EN_CURSO";

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
          <ItemPendiente item={actual} onIniciar={iniciar} submitting={submitting} />
        ) : (
          <ItemEnCurso
            item={actual}
            now={now}
            serverNow={new Date(snapshot.serverNow).getTime()}
            enPausa={enPausa}
          />
        )}

        {enCurso && (
          <div className="flex flex-wrap gap-4 w-full max-w-2xl justify-center">
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
              onClick={finalizar}
              disabled={submitting}
              className="h-24 flex-1 min-w-[200px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-2xl font-bold text-white flex items-center justify-center gap-3 shadow-lg active:scale-95 transition"
            >
              <CheckCircle2 className="h-8 w-8" /> Finalizar
            </button>
          </div>
        )}
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
        Esperá a que el supervisor cargue un PCP.
      </p>
    </div>
  );
}

function ItemPendiente({
  item,
  onIniciar,
  submitting,
}: {
  item: LineaItem;
  onIniciar: () => void;
  submitting: boolean;
}) {
  return (
    <div className="text-center max-w-3xl w-full">
      <p className="uppercase tracking-wider text-slate-400 text-sm mb-2">Próxima orden</p>
      <h1 className="text-4xl md:text-5xl font-bold mb-3">
        {item.cliente.nombre} · {item.articulo.codigo}
      </h1>
      <p className="text-2xl text-slate-300 mb-8">
        {item.cantidad} piezas · {item.color}
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

function ItemEnCurso({
  item,
  now,
  serverNow,
  enPausa,
}: {
  item: LineaItem;
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
        <p className="uppercase tracking-widest text-emerald-400 text-sm mb-3">En línea</p>
        <h1 className="text-3xl md:text-5xl font-bold leading-tight">
          {item.cliente.nombre}
        </h1>
        <p className="text-2xl md:text-3xl font-semibold mt-2 text-slate-200">
          {item.articulo.codigo} · {item.color}
        </p>
        <p className="text-xl text-slate-400 mt-1">{item.cantidad} piezas</p>

        <div
          className={
            "mt-6 font-mono tabular-nums text-7xl md:text-8xl font-bold tracking-wider " +
            (sobretiempo ? "text-red-400" : enPausa ? "text-amber-300" : "text-white")
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
