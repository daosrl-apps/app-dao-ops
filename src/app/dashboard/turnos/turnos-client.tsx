"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2, Clock, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface TurnoView {
  orden: number;
  nombre: string;
  horaInicio: number;
  minutoInicio: number;
  duracionMin: number;
  habilitado: boolean;
}

const TURNOS_DEFAULT: TurnoView[] = [
  { orden: 1, nombre: "Mañana", horaInicio: 6, minutoInicio: 0, duracionMin: 480, habilitado: true },
  { orden: 2, nombre: "Tarde", horaInicio: 14, minutoInicio: 0, duracionMin: 480, habilitado: true },
  { orden: 3, nombre: "Noche", horaInicio: 22, minutoInicio: 0, duracionMin: 480, habilitado: true },
];

// Opciones de hora de inicio cada 0.5 h (00:00, 00:30, … 23:30).
const OPCIONES_INICIO = Array.from({ length: 48 }, (_, i) => ({
  min: i * 30,
  label: `${pad(Math.floor((i * 30) / 60))}:${pad((i * 30) % 60)}`,
}));

// Opciones de duración en horas con decimal cada 0.5 (0.5 … 24).
const OPCIONES_DURACION = Array.from({ length: 48 }, (_, i) => {
  const horas = (i + 1) * 0.5;
  return { min: horas * 60, label: `${horas} h` };
});

export function TurnosClient({
  initial,
  extenderActivo,
}: {
  initial: TurnoView[];
  extenderActivo: boolean;
}) {
  const router = useRouter();
  const [turnos, setTurnos] = React.useState<TurnoView[]>(
    initial.length > 0 ? initial : TURNOS_DEFAULT,
  );
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showExtender, setShowExtender] = React.useState(false);

  const actualizar = (idx: number, patch: Partial<TurnoView>) => {
    setTurnos((curr) => curr.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const agregarTurno = () => {
    if (turnos.length >= 4) return;
    const orden = turnos.length + 1;
    const ultimo = turnos[turnos.length - 1];
    const minStart = ultimo
      ? (ultimo.horaInicio * 60 + ultimo.minutoInicio + ultimo.duracionMin) % (24 * 60)
      : 14 * 60;
    setTurnos((curr) => [
      ...curr,
      {
        orden,
        nombre: `Turno ${orden}`,
        horaInicio: Math.floor(minStart / 60),
        minutoInicio: minStart % 60,
        duracionMin: 480,
        habilitado: true,
      },
    ]);
  };

  const quitarTurno = (idx: number) => {
    setTurnos((curr) => curr.filter((_, i) => i !== idx).map((t, i) => ({ ...t, orden: i + 1 })));
  };

  // Validación local de solape / 24 h para feedback inmediato.
  const errorLocal = validarLocal(turnos);

  const guardar = async () => {
    setSaving(true);
    setMsg(null);
    setError(null);
    const res = await fetch("/api/admin/turnos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnos }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("Turnos guardados.");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "No se pudieron guardar los turnos.");
    }
  };

  const revertirExtension = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/turnos/extender", { method: "DELETE" });
    setSaving(false);
    if (res.ok) {
      router.refresh();
    } else {
      setError("No se pudo revertir el modo extendido.");
    }
  };

  return (
    <div className="space-y-4">
      {extenderActivo && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Modo <b>Extender turno</b> activo (Mañana 06:00–12:00 / Tarde 12:00–00:00).
          </p>
          <Button variant="outline" onClick={revertirExtension} disabled={saving} className="shrink-0">
            <RotateCcw className="h-4 w-4 mr-2" /> Revertir
          </Button>
        </div>
      )}

      {turnos.map((t, idx) => (
        <div
          key={idx}
          className={
            "rounded-2xl bg-white shadow-sm border p-5 " +
            (t.habilitado ? "border-slate-200" : "border-slate-200 opacity-60")
          }
        >
          <div className="flex items-center justify-between mb-4 gap-3">
            <Input
              value={t.nombre}
              onChange={(e) => actualizar(idx, { nombre: e.target.value })}
              className="h-11 text-lg font-bold max-w-[220px]"
              aria-label="Nombre del turno"
            />
            <label className="flex items-center gap-2 shrink-0">
              <input
                type="checkbox"
                checked={t.habilitado}
                onChange={(e) => actualizar(idx, { habilitado: e.target.checked })}
                className="h-5 w-5"
              />
              <span className="text-sm text-slate-700">Habilitado</span>
            </label>
            {turnos.length > 1 && (
              <button
                onClick={() => quitarTurno(idx)}
                className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50 shrink-0"
                aria-label="Quitar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Hora de inicio</span>
              <select
                value={t.horaInicio * 60 + t.minutoInicio}
                onChange={(e) => {
                  const min = Number(e.target.value);
                  actualizar(idx, { horaInicio: Math.floor(min / 60), minutoInicio: min % 60 });
                }}
                disabled={!t.habilitado}
                className="h-14 rounded-xl border border-slate-300 bg-white px-3 text-2xl font-medium disabled:bg-slate-100"
              >
                {OPCIONES_INICIO.map((o) => (
                  <option key={o.min} value={o.min}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Duración</span>
              <select
                value={t.duracionMin}
                onChange={(e) => actualizar(idx, { duracionMin: Number(e.target.value) })}
                disabled={!t.habilitado}
                className="h-14 rounded-xl border border-slate-300 bg-white px-3 text-2xl font-medium disabled:bg-slate-100"
              >
                {OPCIONES_DURACION.map((o) => (
                  <option key={o.min} value={o.min}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="mt-3 text-sm text-slate-500">
            Horario: <b>{formatHora(t.horaInicio, t.minutoInicio)}</b> →{" "}
            <b>{formatHora(...endHHMM(t.horaInicio, t.minutoInicio, t.duracionMin))}</b>
            {cruzaMedianoche(t) && <span className="ml-1 text-slate-400">(día siguiente)</span>}
          </p>
        </div>
      ))}

      {turnos.length < 4 && (
        <Button variant="outline" onClick={agregarTurno} className="w-full h-14">
          <Plus className="h-5 w-5 mr-2" /> Agregar turno {turnos.length + 1}
        </Button>
      )}

      {errorLocal && <p className="text-red-600 font-medium">{errorLocal}</p>}

      <div className="flex flex-wrap justify-between gap-3 pt-2">
        <Button
          variant="outline"
          onClick={() => setShowExtender(true)}
          disabled={saving || extenderActivo}
        >
          <Clock className="h-5 w-5 mr-2" /> Extender turno
        </Button>
        <Button
          onClick={guardar}
          disabled={saving || turnos.length === 0 || errorLocal !== null}
          className="bg-emerald-600 text-white"
          size="lg"
        >
          <Check className="h-5 w-5 mr-2" /> {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      {msg && <p className="text-emerald-700 font-medium">{msg}</p>}
      {error && <p className="text-red-600 font-medium">{error}</p>}

      {showExtender && (
        <ExtenderDialog
          onClose={() => setShowExtender(false)}
          onConfirmed={() => {
            setShowExtender(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ExtenderDialog({
  onClose,
  onConfirmed,
}: {
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [soloUnaVez, setSoloUnaVez] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirmar = async () => {
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/turnos/extender", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ soloUnaVez }),
    });
    setSubmitting(false);
    if (res.ok) {
      onConfirmed();
    } else {
      setError("No se pudo extender el turno.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-slate-900 shadow-2xl">
        <h2 className="text-2xl font-black mb-2">Extender turno</h2>
        <p className="text-slate-600 mb-4">
          Se va a reconfigurar la jornada a <b>Turno Mañana 06:00–12:00</b> y{" "}
          <b>Turno Tarde 12:00–00:00</b>. El turno Noche queda deshabilitado.
        </p>
        <label className="flex items-center gap-3 mb-6">
          <input
            type="checkbox"
            checked={soloUnaVez}
            onChange={(e) => setSoloUnaVez(e.target.checked)}
            className="h-5 w-5"
          />
          <span className="text-base text-slate-800">
            Solo por una vez (vuelve a la configuración actual al cambiar el día)
          </span>
        </label>
        {error && <p className="mb-4 text-red-600 font-medium">{error}</p>}
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={submitting} className="bg-[#1627b1] text-white">
            {submitting ? "Aplicando…" : "Aceptar"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function validarLocal(turnos: TurnoView[]): string | null {
  const habilitados = turnos.filter((t) => t.habilitado);
  if (habilitados.length === 0) return null;
  const total = habilitados.reduce((acc, t) => acc + t.duracionMin, 0);
  if (total > 24 * 60) return "La suma de las duraciones no puede superar las 24 horas.";
  const ivs = habilitados.map((t) => {
    const inicio = t.horaInicio * 60 + t.minutoInicio;
    return { inicio, fin: inicio + t.duracionMin };
  });
  for (let i = 0; i < ivs.length; i++) {
    for (let j = i + 1; j < ivs.length; j++) {
      const a = [ivs[i], { inicio: ivs[i].inicio + 1440, fin: ivs[i].fin + 1440 }];
      const b = [ivs[j], { inicio: ivs[j].inicio + 1440, fin: ivs[j].fin + 1440 }];
      for (const ra of a) {
        for (const rb of b) {
          if (ra.inicio < rb.fin && rb.inicio < ra.fin) {
            return "Hay turnos que se solapan. Revisá horarios y duraciones.";
          }
        }
      }
    }
  }
  return null;
}

function cruzaMedianoche(t: TurnoView): boolean {
  return t.horaInicio * 60 + t.minutoInicio + t.duracionMin > 24 * 60;
}
function formatHora(h: number, m: number) {
  return `${pad(h)}:${pad(m)}`;
}
function endHHMM(h: number, m: number, dur: number): [number, number] {
  const total = h * 60 + m + dur;
  return [Math.floor(total / 60) % 24, total % 60];
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
