"use client";

import * as React from "react";
import { Pencil, Scissors, X } from "lucide-react";

/** Campos mínimos que el modal de edición necesita de una OT. */
export interface OrdenEditable {
  id: string;
  numero: number;
  estado: "PENDIENTE" | "EN_CURSO" | "FINALIZADO" | "CANCELADO";
  tipo: "LAVADO" | "PINTURA";
  color: string;
  cantidad: number;
}

/**
 * Modal de edición de una OT: primero ofrece "Dividir en 2" o "Corregir cantidad
 * total". Si la OT está EN_CURSO, pide cuántas piezas ya se hicieron para acotar
 * la operación a las pendientes. Al dividir, la OT nueva se agenda al final.
 *
 * Se usa tanto en el listado (`ordenes-list-client`) como en el detalle de una
 * OT (`editar-ot-button`).
 */
export function EditarOTModal({
  orden,
  onClose,
  onDone,
}: {
  orden: OrdenEditable;
  onClose: () => void;
  onDone: () => void;
}) {
  const enCurso = orden.estado === "EN_CURSO";
  const esPintura = orden.tipo === "PINTURA";
  const verboPasado = esPintura ? "pintaron" : "lavaron"; // "se pintaron / lavaron"
  const verboInf = esPintura ? "pintar" : "lavar"; // "faltan pintar / lavar"

  const [modo, setModo] = React.useState<"menu" | "split" | "correct">("menu");
  // Piezas ya hechas (solo EN_CURSO). String para manejar el input vacío.
  const [hechasStr, setHechasStr] = React.useState("0");
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hechas = clampInt(hechasStr, 0, orden.cantidad - 1);
  // Piezas pendientes sobre las que operan dividir/corregir.
  const disponibles = orden.cantidad - hechas;

  // --- Dividir en 2: nuevaOt va al final; quedaEnEsta se queda en esta OT. ---
  const [nuevaOtStr, setNuevaOtStr] = React.useState("");
  const nuevaOt = clampInt(nuevaOtStr, 0, disponibles);
  const quedaEnEsta = disponibles - nuevaOt;

  // --- Corregir cantidad ---
  // EN_CURSO: editás cuántas faltan; el total resulta hechas + faltan.
  // PENDIENTE: editás el total directo.
  const [correctStr, setCorrectStr] = React.useState(String(orden.cantidad));
  const faltan = clampInt(correctStr, 0, 100000);
  const nuevoTotal = enCurso ? hechas + faltan : faltan;

  const dividir = async () => {
    setError(null);
    if (disponibles < 2) {
      setError("No hay suficientes piezas pendientes para dividir en 2.");
      return;
    }
    if (nuevaOt < 1 || quedaEnEsta < 1) {
      setError(`Ingresá una cantidad entre 1 y ${disponibles - 1} para la OT nueva.`);
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/ordenes/${orden.id}/split`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ piezasHechas: hechas, quedaEnEsta, nuevaOt }),
    });
    setGuardando(false);
    if (res.ok) return onDone();
    const data = await res.json().catch(() => ({}));
    setError(typeof data.error === "string" ? data.error : "No se pudo dividir la OT.");
  };

  const corregir = async () => {
    setError(null);
    if (nuevoTotal < 1) {
      setError("La cantidad total debe ser al menos 1.");
      return;
    }
    if (enCurso && nuevoTotal < hechas) {
      setError(`El total no puede ser menor a las ${hechas} piezas ya hechas.`);
      return;
    }
    setGuardando(true);
    const res = await fetch(`/api/ordenes/${orden.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ piezasHechas: hechas, cantidad: nuevoTotal }),
    });
    setGuardando(false);
    if (res.ok) return onDone();
    const data = await res.json().catch(() => ({}));
    setError(typeof data.error === "string" ? data.error : "No se pudo corregir la cantidad.");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight text-slate-900">
              Editar OT #{orden.numero}
            </h2>
            <p className="text-sm text-slate-600">
              {orden.cantidad} pzs · {orden.tipo === "PINTURA" ? orden.color : "Lavado"}
              {enCurso && <span className="ml-1 font-semibold text-blue-700">· en curso</span>}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Piezas ya hechas (solo EN_CURSO) — acota las operaciones a lo pendiente. */}
        {enCurso && modo !== "menu" && (
          <label className="mb-4 block">
            <span className="text-sm font-bold text-slate-700">
              ¿Cuántas piezas se {verboPasado} ya?
            </span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={orden.cantidad - 1}
              value={hechasStr}
              onChange={(e) => setHechasStr(e.target.value)}
              className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-lg font-bold tabular-nums focus:border-[#1627b1] focus:outline-none"
            />
            <span className="mt-1 block text-xs text-slate-500">
              Pendientes disponibles: <b className="tabular-nums">{disponibles}</b> pzs
            </span>
          </label>
        )}

        {modo === "menu" && (
          <div className="space-y-3">
            <button
              onClick={() => setModo("split")}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-violet-200 bg-violet-50 p-4 text-left hover:bg-violet-100"
            >
              <Scissors className="h-6 w-6 shrink-0 text-violet-700" />
              <span>
                <span className="block font-black text-violet-900">Dividir en 2</span>
                <span className="block text-sm text-violet-700">
                  Misma OT, repartís las piezas{enCurso ? " pendientes" : ""} en dos. La nueva va al
                  final de la cola.
                </span>
              </span>
            </button>
            <button
              onClick={() => setModo("correct")}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-left hover:bg-slate-100"
            >
              <Pencil className="h-6 w-6 shrink-0 text-slate-700" />
              <span>
                <span className="block font-black text-slate-900">Corregir cantidad total</span>
                <span className="block text-sm text-slate-600">
                  Ajustá cuántas piezas tiene la OT.
                </span>
              </span>
            </button>
          </div>
        )}

        {modo === "split" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Nueva OT (al final)</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={disponibles - 1}
                  value={nuevaOtStr}
                  placeholder="0"
                  autoFocus
                  onChange={(e) => setNuevaOtStr(e.target.value)}
                  className="mt-1 w-full rounded-xl border-2 border-violet-300 px-3 py-2 text-lg font-bold tabular-nums focus:border-violet-600 focus:outline-none"
                />
              </label>
              <div className="block">
                <span className="text-sm font-bold text-slate-700">Queda en esta OT</span>
                <div className="mt-1 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-2 text-lg font-bold tabular-nums text-slate-700">
                  {quedaEnEsta}
                </div>
              </div>
            </div>
            <p className="text-sm text-slate-500">
              Repartís las <b className="tabular-nums">{disponibles}</b> piezas pendientes:{" "}
              <b className="tabular-nums">{quedaEnEsta}</b> + <b className="tabular-nums">{nuevaOt}</b>.
            </p>
            {error && <ErrorMsg msg={error} />}
            <div className="flex gap-2">
              <BotonSecundario onClick={() => setModo("menu")}>Volver</BotonSecundario>
              <BotonPrimario onClick={dividir} disabled={guardando}>
                {guardando ? "Dividiendo…" : "Dividir"}
              </BotonPrimario>
            </div>
          </div>
        )}

        {modo === "correct" && (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {enCurso ? `¿Cuántas faltan ${verboInf}?` : "Cantidad total"}
              </span>
              <input
                type="number"
                inputMode="numeric"
                min={enCurso ? 0 : 1}
                value={correctStr}
                onChange={(e) => setCorrectStr(e.target.value)}
                autoFocus
                className="mt-1 w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-lg font-bold tabular-nums focus:border-[#1627b1] focus:outline-none"
              />
            </label>
            {enCurso && (
              <p className="text-sm text-slate-500">
                Nuevo total: <b className="tabular-nums">{nuevoTotal}</b> pzs ({hechas} hechas +{" "}
                {faltan} pendientes).
              </p>
            )}
            {error && <ErrorMsg msg={error} />}
            <div className="flex gap-2">
              <BotonSecundario onClick={() => setModo("menu")}>Volver</BotonSecundario>
              <BotonPrimario onClick={corregir} disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </BotonPrimario>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Parsea un entero del input acotándolo a [min, max]; vacío/NaN → min. */
function clampInt(value: string, min: number, max: number): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{msg}</p>
  );
}

function BotonPrimario({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 rounded-xl bg-[#1627b1] px-4 py-3 font-bold text-white hover:bg-[#1627b1]/90 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function BotonSecundario({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-xl border-2 border-slate-200 px-4 py-3 font-bold text-slate-700 hover:bg-slate-50"
    >
      {children}
    </button>
  );
}
