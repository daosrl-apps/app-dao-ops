"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface TurnoView {
  orden: number;
  horaInicio: number;
  minutoInicio: number;
  duracionMin: number;
  habilitado: boolean;
}

const TURNO_DEFAULT: TurnoView = {
  orden: 1,
  horaInicio: 6,
  minutoInicio: 0,
  duracionMin: 480,
  habilitado: true,
};

export function TurnosClient({ initial }: { initial: TurnoView[] }) {
  const router = useRouter();
  const [turnos, setTurnos] = React.useState<TurnoView[]>(
    initial.length > 0 ? initial : [TURNO_DEFAULT],
  );
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const actualizar = (idx: number, patch: Partial<TurnoView>) => {
    setTurnos((curr) => curr.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const agregarTurno = () => {
    if (turnos.length >= 4) return;
    const orden = turnos.length + 1;
    // Hora sugerida: arranca después del último turno (no choca).
    const ultimo = turnos[turnos.length - 1];
    const minStart = ultimo
      ? (ultimo.horaInicio * 60 + ultimo.minutoInicio + ultimo.duracionMin) % (24 * 60)
      : 14 * 60;
    setTurnos((curr) => [
      ...curr,
      {
        orden,
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

  return (
    <div className="space-y-4">
      {turnos.map((t, idx) => (
        <div key={idx} className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800">Turno {t.orden}</h2>
            {turnos.length > 1 && (
              <button
                onClick={() => quitarTurno(idx)}
                className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                aria-label="Quitar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Hora de inicio</span>
              <div className="flex gap-2 items-center">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={t.horaInicio}
                  onChange={(e) =>
                    actualizar(idx, { horaInicio: Math.max(0, Math.min(23, Number(e.target.value))) })
                  }
                  className="h-14 text-2xl text-right font-medium"
                />
                <span className="text-2xl text-slate-400">:</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={t.minutoInicio}
                  onChange={(e) =>
                    actualizar(idx, {
                      minutoInicio: Math.max(0, Math.min(59, Number(e.target.value))),
                    })
                  }
                  className="h-14 text-2xl text-right font-medium"
                />
              </div>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Duración (minutos)</span>
              <Input
                type="number"
                min={30}
                max={1440}
                step={30}
                value={t.duracionMin}
                onChange={(e) =>
                  actualizar(idx, {
                    duracionMin: Math.max(30, Math.min(1440, Number(e.target.value))),
                  })
                }
                className="h-14 text-2xl text-right font-medium"
              />
              <span className="text-xs text-slate-500 mt-1">{horasMin(t.duracionMin)}</span>
            </label>

            <label className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                checked={t.habilitado}
                onChange={(e) => actualizar(idx, { habilitado: e.target.checked })}
                className="h-5 w-5"
              />
              <span className="text-base text-slate-700">Habilitado</span>
            </label>
          </div>

          <p className="mt-3 text-sm text-slate-500">
            Horario: <b>{formatHora(t.horaInicio, t.minutoInicio)}</b> →{" "}
            <b>{formatHora(...endHHMM(t.horaInicio, t.minutoInicio, t.duracionMin))}</b>
          </p>
        </div>
      ))}

      {turnos.length < 4 && (
        <Button variant="outline" onClick={agregarTurno} className="w-full h-14">
          <Plus className="h-5 w-5 mr-2" /> Agregar turno {turnos.length + 1}
        </Button>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button
          onClick={guardar}
          disabled={saving || turnos.length === 0}
          className="bg-emerald-600 text-white"
          size="lg"
        >
          <Check className="h-5 w-5 mr-2" /> {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>

      {msg && <p className="text-emerald-700 font-medium">{msg}</p>}
      {error && <p className="text-red-600 font-medium">{error}</p>}
    </div>
  );
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
function horasMin(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (m === 0) return `${h} hs`;
  return `${h} h ${m} min`;
}
