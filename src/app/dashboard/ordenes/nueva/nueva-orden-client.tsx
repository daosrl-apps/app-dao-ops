"use client";

/**
 * Formulario de nueva OT (1 OT = 1 ítem).
 *
 * Flujo:
 *  1. Elegir tipo (LAVADO / PINTURA), cliente, artículo, color, cantidad.
 *  2. El horario de inicio se pre-rellena con la sugerencia del backend
 *     (fin de la última OT activa + 15 min, o + 45 si cambia el color).
 *     El usuario puede empujarlo hacia adelante pero NO hacia atrás del
 *     sugerido — el backend además valida con 409 si hay solape.
 *  3. Si la OT excede el turno donde cae el inicio, el backend devuelve
 *     `needsSplit` y mostramos un modal pidiendo cuántas piezas se completan
 *     en este turno; el resto se crea como continuación en el primer turno
 *     disponible del día siguiente.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Clock, Droplets, Paintbrush, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatFechaHora as fmtFechaHoraUtil } from "@/lib/utils";
import { PIEZAS_POR_PERCHA_OPTIONS } from "@/lib/linea";

type Tipo = "LAVADO" | "PINTURA";

const CATALOGO_COLORES = [
  "Aluminio", "Amarillo", "Amarillo maíz", "Azul", "Beige", "Blanco",
  "Blanco brillante", "Estrellita", "Fluor naranja", "Fluor rosa", "Fluor verde",
  "Galv / galvanizado", "Grafito", "Gris", "Gris Shell", "Gris Stara",
  "Gris topo", "Marrón", "Naranja", "Negro", "Negro tex", "Negro texturado",
  "Negro s/mate", "Ocre", "Platil", "Rojo", "Rosa", "Shell", "Verde",
];

interface Cliente {
  id: string;
  nombre: string;
}

interface Articulo {
  id: string;
  codigo: string;
  descripcion: string | null;
  piezasPorHora: number;
  color: string;
  configPerchas: string | null;
  cliente: { id: string; nombre: string };
}

interface Sugerencia {
  sugerido: string;
  minimo: string;
  gapSeg: number;
  razon: "con_orden_previa" | "sin_orden_activa" | "sin_orden_previa" | "base" | "cambio_color";
  ordenAnterior: {
    id: string;
    numero: number;
    finTeorico: string;
    color: string;
    tipo: Tipo;
    estado?: string;
    esActiva?: boolean;
    codigo?: string | null;
    descripcion?: string | null;
  } | null;
}

interface SplitInfo {
  fitSeg: number;
  restoSeg: number;
  finTurno: string;
  proximoInicio: string;
  sugerenciaCantidadHoy: number;
}

export function NuevaOrdenClient() {
  const router = useRouter();
  const [tipo, setTipo] = React.useState<Tipo>("PINTURA");
  const [cliente, setCliente] = React.useState<Cliente | null>(null);
  const [articulo, setArticulo] = React.useState<Articulo | null>(null);
  const [color, setColor] = React.useState<string>("");
  const [cantidad, setCantidad] = React.useState<string>("");
  const [piezasPorPercha, setPiezasPorPercha] = React.useState<number>(1);
  const [velocidadLavado, setVelocidadLavado] = React.useState<number>(1.0);

  const [sugerencia, setSugerencia] = React.useState<Sugerencia | null>(null);
  const [inicioFecha, setInicioFecha] = React.useState<string>(() => hoyISO());
  const [inicioHora, setInicioHora] = React.useState<string>(() => ahoraHHMM());

  // Transiciones y tiempos de preparación interactivos
  const [requiereGanchera, setRequiereGanchera] = React.useState<boolean | null>(null);
  const [minutosGanchera, setMinutosGanchera] = React.useState<string>("");

  const [requiereColor, setRequiereColor] = React.useState<boolean | null>(null);
  const [minutosColor, setMinutosColor] = React.useState<string>("");

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [splitInfo, setSplitInfo] = React.useState<SplitInfo | null>(null);

  // Determinar si aplica evaluar cambio de color o preparación de cabina
  const aplicaColor = React.useMemo(() => {
    return tipo === "PINTURA" || sugerencia?.ordenAnterior?.tipo === "PINTURA";
  }, [tipo, sugerencia?.ordenAnterior]);

  const gancheraMin = requiereGanchera === true ? Number(minutosGanchera || 0) : 0;
  const colorMin = requiereColor === true ? Number(minutosColor || 0) : 0;
  const totalGapMin = gancheraMin + (aplicaColor ? colorMin : 0);

  // Refrescamos la sugerencia cada vez que cambia tipo/color.
  React.useEffect(() => {
    let cancelled = false;
    const fetchSugerencia = async () => {
      const params = new URLSearchParams({ tipo, color: color || "" });
      const res = await fetch(`/api/ordenes/sugerencia?${params}`);
      if (!res.ok) return;
      const data: Sugerencia = await res.json();
      if (cancelled) return;
      setSugerencia(data);
      if (!data.ordenAnterior || !data.ordenAnterior.esActiva) {
        const d = new Date(data.sugerido);
        setInicioFecha(toYMD(d));
        setInicioHora(toHHMM(d));
      }
    };
    fetchSugerencia();
    return () => {
      cancelled = true;
    };
  }, [tipo, color]);

  // Recalcular dinámicamente el inicio sugerido según los minutos de preparación / transición configurados
  React.useEffect(() => {
    if (!sugerencia) return;
    if (sugerencia.ordenAnterior && sugerencia.ordenAnterior.esActiva) {
      const finPrev = new Date(sugerencia.ordenAnterior.finTeorico);
      const nuevoInicio = new Date(finPrev.getTime() + totalGapMin * 60 * 1000);
      const MIN_MS = 60_000;
      const inicioRedondeado = new Date(Math.ceil(nuevoInicio.getTime() / MIN_MS) * MIN_MS);
      setInicioFecha(toYMD(inicioRedondeado));
      setInicioHora(toHHMM(inicioRedondeado));
    } else if (sugerencia.sugerido) {
      const base = new Date(sugerencia.sugerido);
      const nuevoInicio = new Date(base.getTime() + totalGapMin * 60 * 1000);
      const MIN_MS = 60_000;
      const inicioRedondeado = new Date(Math.ceil(nuevoInicio.getTime() / MIN_MS) * MIN_MS);
      setInicioFecha(toYMD(inicioRedondeado));
      setInicioHora(toHHMM(inicioRedondeado));
    }
  }, [sugerencia?.ordenAnterior?.finTeorico, sugerencia?.ordenAnterior?.esActiva, sugerencia?.sugerido, totalGapMin]);

  // Puede ser null mientras el usuario está editando los campos (fecha/hora incompletas).
  const inicioISO = React.useMemo(() => {
    const [y, m, d] = inicioFecha.split("-").map(Number);
    const [h, mi] = inicioHora.split(":").map(Number);
    if ([y, m, d, h, mi].some((n) => !Number.isFinite(n))) return null;
    const date = new Date(y, m - 1, d, h, mi, 0, 0);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  }, [inicioFecha, inicioHora]);

  // Validación: el inicio elegido no puede ser menor al fin de la orden anterior en curso si está activa.
  const inicioTooEarly = React.useMemo(() => {
    if (!sugerencia?.ordenAnterior?.esActiva || !inicioISO) return false;
    const minMs = new Date(sugerencia.ordenAnterior.finTeorico).getTime();
    return new Date(inicioISO).getTime() < minMs - 30_000;
  }, [inicioISO, sugerencia?.ordenAnterior]);

  const gancheraValida =
    requiereGanchera === false ||
    (requiereGanchera === true && Number(minutosGanchera) > 0);

  const colorValido =
    !aplicaColor ||
    requiereColor === false ||
    (requiereColor === true && Number(minutosColor) > 0);

  const pendienteGanchera = requiereGanchera === null;
  const pendienteColor = aplicaColor && requiereColor === null;

  const puedeGuardar =
    !!articulo &&
    !!cantidad &&
    Number(cantidad) > 0 &&
    !!inicioISO &&
    !inicioTooEarly &&
    gancheraValida &&
    colorValido &&
    !pendienteGanchera &&
    !pendienteColor &&
    (tipo !== "PINTURA" || !!color || !!articulo?.color);

  const guardar = async (opts?: { cantidadHoy?: number; forzarCompleto?: boolean }) => {
    if (!inicioISO) {
      setError("Ingresá una fecha y hora de inicio válidas.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const body = {
      articuloId: articulo!.id,
      tipo,
      color: tipo === "PINTURA" ? color || articulo!.color : "(lavado)",
      cantidad: Number(cantidad),
      inicioProgramado: inicioISO,
      piezasPorPercha: tipo === "LAVADO" ? piezasPorPercha : null,
      velocidadLavado: tipo === "LAVADO" ? velocidadLavado : null,
      minutosGanchera: gancheraMin,
      minutosColor: aplicaColor ? colorMin : 0,
      split: opts?.cantidadHoy != null ? { cantidadHoy: opts.cantidadHoy } : undefined,
      forzarCompleto: opts?.forzarCompleto ?? undefined,
    };
    const res = await fetch("/api/ordenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (res.status === 409 && typeof data.minimo === "string") {
      const min = new Date(data.minimo);
      setInicioFecha(toYMD(min));
      setInicioHora(toHHMM(min));
      setError(
        `El horario elegido se solapa con la OT #${data.ordenAnterior?.numero}. Mínimo permitido: ${formatFechaHora(min)}.`,
      );
      return;
    }
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "No se pudo guardar la OT.");
      return;
    }
    if (data.needsSplit) {
      setSplitInfo({
        fitSeg: data.fitSeg,
        restoSeg: data.restoSeg,
        finTurno: data.finTurno,
        proximoInicio: data.proximoInicio,
        sugerenciaCantidadHoy: data.sugerenciaCantidadHoy,
      });
      return;
    }
    router.push("/dashboard/ordenes");
  };

  return (
    <section className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-6">Nueva orden de trabajo</h1>

      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-5">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTipo("PINTURA")}
            className={
              "flex-1 h-14 rounded-xl border-2 font-bold inline-flex items-center justify-center gap-2 " +
              (tipo === "PINTURA"
                ? "border-violet-500 bg-violet-50 text-violet-900"
                : "border-slate-300 bg-white text-slate-600")
            }
          >
            <Paintbrush className="h-5 w-5" /> Pintura
          </button>
          <button
            type="button"
            onClick={() => setTipo("LAVADO")}
            className={
              "flex-1 h-14 rounded-xl border-2 font-bold inline-flex items-center justify-center gap-2 " +
              (tipo === "LAVADO"
                ? "border-sky-500 bg-sky-50 text-sky-900"
                : "border-slate-300 bg-white text-slate-600")
            }
          >
            <Droplets className="h-5 w-5" /> Lavado
          </button>
        </div>

        <ClienteAutocomplete
          value={cliente}
          onChange={(c) => {
            setCliente(c);
            setArticulo(null);
            setColor("");
          }}
        />
        <ArticuloAutocomplete
          clienteId={cliente?.id ?? null}
          value={articulo}
          onChange={(a) => {
            setArticulo(a);
            setColor(a?.color ?? "");
          }}
        />

        {tipo === "PINTURA" && (
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-slate-700">Color</span>
            <Select value={color} onChange={(e) => setColor(e.target.value)}>
              <option value="">— seleccionar —</option>
              {CATALOGO_COLORES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Cantidad (piezas)</span>
          <Input
            inputMode="numeric"
            pattern="\d*"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ""))}
            placeholder="0"
            className="h-14 text-2xl text-right font-medium"
          />
        </label>

        {tipo === "LAVADO" && (
          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Piezas por percha</span>
              <Select
                value={piezasPorPercha}
                onChange={(e) => setPiezasPorPercha(Number(e.target.value))}
              >
                {PIEZAS_POR_PERCHA_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Velocidad lavado (m/min)</span>
              <Select
                value={velocidadLavado}
                onChange={(e) => setVelocidadLavado(Number(e.target.value))}
              >
                {Array.from({ length: 30 }, (_, i) => +(0.1 * (i + 1)).toFixed(1)).map((v) => (
                  <option key={v} value={v}>{v.toFixed(1)}</option>
                ))}
              </Select>
            </label>
          </div>
        )}

        {/* Sección de Preparación y Transición de Línea */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-4">
          <div className="flex items-start gap-2.5 border-b border-slate-200 pb-3">
            <Clock className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-slate-800">
                {sugerencia?.ordenAnterior?.esActiva
                  ? `Transición desde la OT anterior #${sugerencia.ordenAnterior.numero}`
                  : sugerencia?.ordenAnterior
                  ? `Preparación de línea (Última OT en línea: #${sugerencia.ordenAnterior.numero})`
                  : "Preparación de línea previa al inicio"}
              </p>
              <p className="text-xs text-slate-500">
                {sugerencia?.ordenAnterior ? (
                  <>
                    {sugerencia.ordenAnterior.tipo === "PINTURA" ? "Pintura" : "Lavado"}
                    {sugerencia.ordenAnterior.codigo ? ` · ${sugerencia.ordenAnterior.codigo}` : ""}
                    {sugerencia.ordenAnterior.color ? ` · Color: ${sugerencia.ordenAnterior.color}` : ""}
                    {sugerencia.ordenAnterior.esActiva ? (
                      <>
                        {" · "}Finaliza: <b>{formatFechaHora(new Date(sugerencia.ordenAnterior.finTeorico))}</b>
                      </>
                    ) : (
                      <>
                        {" · "}<span className="text-emerald-700 font-semibold">Finalizada</span>
                      </>
                    )}
                  </>
                ) : (
                  "Sin órdenes previas activas en cola · Podés asignar tiempos de preparación si la línea lo requiere."
                )}
              </p>
            </div>
          </div>

          {/* Pregunta 1: Cambio de ganchera */}
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-700">
                ¿Requiere cambio de ganchera?
              </span>
              <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white">
                <button
                  type="button"
                  onClick={() => {
                    setRequiereGanchera(false);
                    setMinutosGanchera("");
                  }}
                  className={
                    "px-4 py-1.5 text-xs font-bold rounded-md transition-all " +
                    (requiereGanchera === false
                      ? "bg-slate-800 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900")
                  }
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={() => setRequiereGanchera(true)}
                  className={
                    "px-4 py-1.5 text-xs font-bold rounded-md transition-all " +
                    (requiereGanchera === true
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900")
                  }
                >
                  Sí
                </button>
              </div>
            </div>

            {requiereGanchera === true && (
              <div className="mt-2.5 flex items-center justify-between gap-3 bg-white border border-indigo-200 rounded-xl p-3 shadow-sm">
                <label className="text-xs font-medium text-slate-700">
                  ¿Cuántos minutos le asignás al cambio de ganchera?
                </label>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Input
                    type="number"
                    min="1"
                    placeholder="0"
                    value={minutosGanchera}
                    onChange={(e) => setMinutosGanchera(e.target.value.replace(/\D/g, ""))}
                    className="w-20 h-9 text-center font-bold text-sm"
                  />
                  <span className="text-xs text-slate-500 font-medium">min</span>
                </div>
              </div>
            )}
            {requiereGanchera === false && (
              <p className="mt-1.5 text-xs text-emerald-700 font-medium">
                ✓ 0 min — Continúa con las mismas gancheras de la línea.
              </p>
            )}
          </div>

          {/* Pregunta 2: Cambio de color / Preparación de cabina */}
          {aplicaColor && (
            <div className="border-t border-slate-200 pt-3">
              {/* Banner contextual de color */}
              {sugerencia?.ordenAnterior && sugerencia.ordenAnterior.tipo === "PINTURA" && tipo === "PINTURA" && (
                color && sugerencia.ordenAnterior.color &&
                color.trim().toLowerCase() !== sugerencia.ordenAnterior.color.trim().toLowerCase() ? (
                  <div className="text-xs text-amber-800 font-semibold mb-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                    ⚠️ Cambio de color detectado: de <b>{sugerencia.ordenAnterior.color}</b> a <b>{color}</b>.
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 mb-2">
                    Mismo color ({color || sugerencia.ordenAnterior.color}).
                  </p>
                )
              )}

              {sugerencia?.ordenAnterior && sugerencia.ordenAnterior.tipo === "LAVADO" && tipo === "PINTURA" && (
                <div className="text-xs text-indigo-800 font-medium mb-2 bg-indigo-50 border border-indigo-200 rounded-lg p-2.5">
                  ℹ️ Transición de Lavado a Pintura (revisar cabina de pintura).
                </div>
              )}

              {sugerencia?.ordenAnterior && sugerencia.ordenAnterior.tipo === "PINTURA" && tipo === "LAVADO" && (
                <div className="text-xs text-indigo-800 font-medium mb-2 bg-indigo-50 border border-indigo-200 rounded-lg p-2.5">
                  ℹ️ Transición de Pintura a Lavado (revisar cabina / limpieza).
                </div>
              )}

              {!sugerencia?.ordenAnterior && tipo === "PINTURA" && (
                <div className="text-xs text-indigo-800 font-medium mb-2 bg-indigo-50 border border-indigo-200 rounded-lg p-2.5">
                  ℹ️ Orden de Pintura (preparación de cabina / carga de pintura).
                </div>
              )}

              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-700">
                  ¿Requiere cambio de color o preparación de cabina?
                </span>
                <div className="inline-flex rounded-lg border border-slate-300 p-0.5 bg-white">
                  <button
                    type="button"
                    onClick={() => {
                      setRequiereColor(false);
                      setMinutosColor("");
                    }}
                    className={
                      "px-4 py-1.5 text-xs font-bold rounded-md transition-all " +
                      (requiereColor === false
                        ? "bg-slate-800 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900")
                    }
                  >
                    No
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequiereColor(true)}
                    className={
                      "px-4 py-1.5 text-xs font-bold rounded-md transition-all " +
                      (requiereColor === true
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900")
                    }
                  >
                    Sí
                  </button>
                </div>
              </div>

              {requiereColor === true && (
                <div className="mt-2.5 flex items-center justify-between gap-3 bg-white border border-indigo-200 rounded-xl p-3 shadow-sm">
                  <label className="text-xs font-medium text-slate-700">
                    ¿Cuántos minutos le asignás al cambio de color / cabina?
                  </label>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Input
                      type="number"
                      min="1"
                      placeholder="0"
                      value={minutosColor}
                      onChange={(e) => setMinutosColor(e.target.value.replace(/\D/g, ""))}
                      className="w-20 h-9 text-center font-bold text-sm"
                    />
                    <span className="text-xs text-slate-500 font-medium">min</span>
                  </div>
                </div>
              )}
              {requiereColor === false && (
                <p className="mt-1.5 text-xs text-emerald-700 font-medium">
                  ✓ 0 min — Sin tiempo de cambio de color / cabina.
                </p>
              )}
            </div>
          )}

          {/* Resumen de la preparación / transición */}
          <div className="border-t border-slate-200 pt-2.5">
            {totalGapMin === 0 && requiereGanchera === false && (!aplicaColor || requiereColor === false) && (
              <p className="text-xs text-emerald-800 font-semibold">
                {sugerencia?.ordenAnterior?.esActiva ? (
                  <>🟢 <b>Inmediato:</b> La orden arrancará inmediatamente al finalizar la OT #{sugerencia.ordenAnterior.numero} sin pausas.</>
                ) : (
                  <>🟢 <b>Sin espera previa:</b> La orden arrancará en el horario programado sin tiempos previos de preparación.</>
                )}
              </p>
            )}
            {totalGapMin > 0 && (
              <p className="text-xs text-indigo-900 font-semibold">
                ⏱️ <b>Tiempo de preparación:</b> {totalGapMin} min total
                {gancheraMin > 0 ? ` (${gancheraMin} min gancheras` : ""}
                {gancheraMin > 0 && colorMin > 0 ? ` + ${colorMin} min color/cabina` : ""}
                {gancheraMin === 0 && colorMin > 0 ? ` (${colorMin} min color/cabina` : ""}
                {")"}
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5">
          <p className="text-sm font-medium text-slate-700 mb-2">Horario de inicio</p>
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="date"
              value={inicioFecha}
              onChange={(e) => setInicioFecha(e.target.value)}
              className="h-14 text-lg"
            />
            <Input
              type="time"
              value={inicioHora}
              onChange={(e) => setInicioHora(e.target.value)}
              className="h-14 text-lg"
            />
          </div>

          {sugerencia && <SugerenciaInfo sugerencia={sugerencia} totalGapMin={totalGapMin} />}

          {inicioTooEarly && sugerencia?.ordenAnterior?.esActiva && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                No podés iniciar antes de las{" "}
                <b>{formatFechaHora(new Date(sugerencia.ordenAnterior.finTeorico))}</b> porque la OT
                #{sugerencia.ordenAnterior.numero} todavía estará en curso.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-500 mt-2">
            Si la OT no entra en el turno, el sistema va a preguntarte cómo partirla.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-end sm:items-center justify-between gap-3 pt-2">
          <div className="text-xs text-amber-700 font-medium">
            {pendienteGanchera && "⚠️ Indicá si requiere cambio de ganchera arriba."}
            {!pendienteGanchera && requiereGanchera === true && (!minutosGanchera || Number(minutosGanchera) <= 0) && "⚠️ Ingresá los minutos para el cambio de ganchera."}
            {!pendienteGanchera && (!requiereGanchera || Number(minutosGanchera) > 0) && pendienteColor && "⚠️ Indicá si requiere cambio de color / cabina arriba."}
            {!pendienteGanchera && (!requiereGanchera || Number(minutosGanchera) > 0) && !pendienteColor && requiereColor === true && (!minutosColor || Number(minutosColor) <= 0) && "⚠️ Ingresá los minutos para el cambio de color."}
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => router.push("/dashboard/ordenes")}>
              Cancelar
            </Button>
            <Button
              onClick={() => guardar()}
              disabled={!puedeGuardar || submitting}
              className="bg-[#1627b1] text-white"
              size="lg"
            >
              <Check className="h-5 w-5 mr-2" />
              {submitting ? "Guardando…" : "Crear OT"}
            </Button>
          </div>
        </div>

        {error && <p className="text-red-600 font-medium">{error}</p>}
      </div>

      {splitInfo && (
        <NoEntraDialog
          cantidadTotal={Number(cantidad)}
          tipo={tipo}
          inicioISO={inicioISO}
          info={splitInfo}
          onCancel={() => setSplitInfo(null)}
          onConfirm={async (payload) => {
            setSplitInfo(null);
            await guardar(payload);
          }}
          submitting={submitting}
        />
      )}
    </section>
  );
}

// =============================================================================
// Info de la sugerencia de horario
// =============================================================================

function SugerenciaInfo({
  sugerencia,
  totalGapMin,
}: {
  sugerencia: Sugerencia;
  totalGapMin: number;
}) {
  if (!sugerencia.ordenAnterior || !sugerencia.ordenAnterior.esActiva) {
    if (totalGapMin > 0) {
      return (
        <p className="mt-2 text-xs text-indigo-700 font-medium">
          ⏱️ Horario sugerido incluye <b>{totalGapMin} min</b> de preparación previa.
        </p>
      );
    }
    return (
      <p className="mt-2 text-xs text-slate-500">
        No hay OTs activas en cola. Podés arrancar de inmediato o elegir cualquier horario.
      </p>
    );
  }
  const prev = sugerencia.ordenAnterior;
  return (
    <p className="mt-2 text-xs text-slate-600">
      Sugerido: <b>{formatFechaHora(new Date(sugerencia.sugerido))}</b> ={" "}
      fin de OT #{prev.numero} ({formatFechaHora(new Date(prev.finTeorico))})
      {totalGapMin > 0 ? ` + ${totalGapMin} min de preparación/transición.` : " (sin tiempo de espera)."}
    </p>
  );
}

// =============================================================================
// NoEntraDialog — la OT no entra en el turno: partir / extender N h / completar
// =============================================================================

type ConfirmPayload = { cantidadHoy?: number; forzarCompleto?: boolean };
type Modo = "partir" | "extender" | "completar";

function NoEntraDialog({
  cantidadTotal,
  tipo,
  inicioISO,
  info,
  onCancel,
  onConfirm,
  submitting,
}: {
  cantidadTotal: number;
  tipo: Tipo;
  inicioISO: string | null;
  info: SplitInfo;
  onCancel: () => void;
  onConfirm: (payload: ConfirmPayload) => void;
  submitting: boolean;
}) {
  // fit + resto = duración total de la OT (en segundos).
  const durTotalSeg = info.fitSeg + info.restoSeg;
  const [modo, setModo] = React.useState<Modo>("partir");

  // Verbo según el tipo de OT (pintar / lavar) para las leyendas.
  const verbCond = tipo === "PINTURA" ? "pintarían" : "lavarían"; // "se {verbCond}"
  const verbInf = tipo === "PINTURA" ? "pintarse" : "lavarse"; //   "a {verbInf}"

  // --- Opción 1: partir en el borde del turno (sin pedir cantidad) ------------
  // Lo que entra hasta el cierre se hace hoy; el resto pasa al turno siguiente.
  const partirHoy = info.sugerenciaCantidadHoy;
  const partirResto = cantidadTotal - partirHoy;
  const partirValido = partirHoy > 0 && partirResto > 0;

  // --- Opción 2: extender el turno N horas -----------------------------------
  const [horas, setHoras] = React.useState<string>("1");
  const horasValido = /^\d+$/.test(horas) && Number(horas) > 0;
  const horasNum = horasValido ? Number(horas) : 0;
  // Piezas que entran hoy con la extensión (duración es lineal en la cantidad).
  const tiempoHoySeg = info.fitSeg + horasNum * 3600;
  const cantidadHoyExt =
    durTotalSeg > 0
      ? Math.max(0, Math.min(cantidadTotal, Math.floor((cantidadTotal * tiempoHoySeg) / durTotalSeg)))
      : 0;
  const restoExt = cantidadTotal - cantidadHoyExt; // piezas que pasan al otro día
  const entraTodoConExtension = restoExt <= 0;
  const finExtendido = new Date(new Date(info.finTurno).getTime() + horasNum * 3600 * 1000);
  const extenderValido = horasValido && cantidadHoyExt > 0;

  // --- Opción 3: extender hasta terminar -------------------------------------
  const finCompleto = inicioISO ? new Date(new Date(inicioISO).getTime() + durTotalSeg * 1000) : null;

  const confirmar = () => {
    if (modo === "partir") {
      onConfirm({ cantidadHoy: partirHoy });
    } else if (modo === "extender") {
      // Si con la extensión entra todo, es una sola OT completa (sin continuación).
      if (entraTodoConExtension) onConfirm({ forzarCompleto: true });
      else onConfirm({ cantidadHoy: cantidadHoyExt });
    } else {
      onConfirm({ forzarCompleto: true });
    }
  };

  const puedeConfirmar =
    modo === "partir" ? partirValido : modo === "extender" ? extenderValido : true;

  const etiquetaConfirmar =
    modo === "partir" ? "Partir" : modo === "extender" ? "Extender" : "Extender hasta terminar";

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-black mb-2">La OT no entra en el turno</h2>
        <p className="text-slate-600 mb-4">
          El turno termina a las <b>{formatHora(new Date(info.finTurno))}</b>. Elegí qué hacer:
        </p>

        <div className="space-y-3">
          {/* Opción 1 — Partir */}
          <OpcionCard
            activo={modo === "partir"}
            onSelect={() => setModo("partir")}
            titulo="Partir la OT"
            descripcion="Lo que no entra hasta el cierre pasa al comienzo del turno del día siguiente."
          >
            {partirValido ? (
              <p className="text-sm text-slate-600">
                Hoy: <b>{partirHoy}</b> · Continuación ({formatFechaHora(new Date(info.proximoInicio))}):{" "}
                <b>{partirResto}</b>.
              </p>
            ) : (
              <p className="text-sm text-amber-700">
                No alcanza a completarse ni una pieza antes del cierre. Usá una de las otras opciones.
              </p>
            )}
          </OpcionCard>

          {/* Opción 2 — Extender el turno N horas */}
          <OpcionCard
            activo={modo === "extender"}
            onSelect={() => setModo("extender")}
            titulo="Extender el turno"
            descripcion="Estirar el cierre unas horas; lo que no entre pasa al otro día."
          >
            <div className="flex items-center gap-3">
              <label className="flex flex-col gap-1 shrink-0">
                <span className="text-sm font-medium text-slate-700">Horas</span>
                <Input
                  inputMode="numeric"
                  pattern="\d*"
                  maxLength={2}
                  value={horas}
                  onChange={(e) => setHoras(e.target.value.replace(/\D/g, "").slice(0, 2))}
                  className="h-12 w-16 text-xl text-center font-medium"
                />
              </label>
              {horasValido && (
                <p className="text-sm text-slate-600">
                  El turno cierra a las <b>{formatHora(finExtendido)}</b>
                  {entraTodoConExtension ? (
                    <> y se {verbCond} <b>las {cantidadTotal}</b> piezas.</>
                  ) : (
                    <> y se {verbCond} <b>{cantidadHoyExt}</b> piezas.</>
                  )}
                </p>
              )}
            </div>
            {horasValido && (
              entraTodoConExtension ? (
                <p className="mt-2 text-sm text-slate-600">No queda nada para el turno siguiente.</p>
              ) : (
                <p className="mt-2 text-sm text-slate-600">
                  Restan <b>{restoExt}</b> piezas a {verbInf} el turno siguiente (
                  {formatFechaHora(new Date(info.proximoInicio))}).
                </p>
              )
            )}
          </OpcionCard>

          {/* Opción 3 — Extender hasta terminar */}
          <OpcionCard
            activo={modo === "completar"}
            onSelect={() => setModo("completar")}
            titulo="Extender hasta terminar"
            descripcion="La OT se hace completa extendiendo el turno actual hasta terminar."
          >
            {finCompleto && (
              <p className="text-sm text-slate-600">
                Las <b>{cantidadTotal}</b> piezas terminan a las <b>{formatFechaHora(finCompleto)}</b>.
              </p>
            )}
          </OpcionCard>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button
            onClick={confirmar}
            disabled={!puedeConfirmar || submitting}
            className="bg-[#1627b1] text-white"
            size="lg"
          >
            <Check className="h-5 w-5 mr-2" />
            {submitting ? "Guardando…" : etiquetaConfirmar}
          </Button>
        </div>
      </div>
    </div>
  );
}

function OpcionCard({
  activo,
  onSelect,
  titulo,
  descripcion,
  children,
}: {
  activo: boolean;
  onSelect: () => void;
  titulo: string;
  descripcion: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className={
        "rounded-xl border-2 p-4 cursor-pointer transition-colors " +
        (activo ? "border-[#1627b1] bg-violet-50/40" : "border-slate-200 bg-white hover:border-slate-300")
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            "mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center " +
            (activo ? "border-[#1627b1]" : "border-slate-300")
          }
        >
          {activo && <span className="h-2.5 w-2.5 rounded-full bg-[#1627b1]" />}
        </span>
        <div className="flex-1">
          <p className="font-bold text-slate-900">{titulo}</p>
          <p className="text-sm text-slate-500">{descripcion}</p>
          {activo && children && <div className="mt-3">{children}</div>}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Autocompletes
// =============================================================================

function ClienteAutocomplete({
  value,
  onChange,
}: {
  value: Cliente | null;
  onChange: (c: Cliente | null) => void;
}) {
  const [q, setQ] = React.useState(value?.nombre ?? "");
  const [open, setOpen] = React.useState(false);
  const [resultados, setResultados] = React.useState<Cliente[]>([]);

  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResultados(data.clientes ?? []);
    }, 150);
    return () => clearTimeout(t);
  }, [q, open]);

  return (
    <label className="flex flex-col gap-1 relative">
      <span className="text-sm font-medium text-slate-700">Cliente</span>
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          if (value && e.target.value !== value.nombre) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar cliente…"
      />
      {open && resultados.length > 0 && (
        <ul className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl bg-white shadow-lg border border-slate-200 max-h-80 overflow-y-auto">
          {resultados.map((c) => (
            <li key={c.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(c);
                  setQ(c.nombre);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-100 text-base"
              >
                {c.nombre}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}

/**
 * Autocomplete de producto. Estilo: el nombre/descripción es el título grande;
 * el código va abajo como subtítulo chico. Al seleccionar, el input muestra
 * la descripción (cae al código solo si no hay descripción).
 */
function ArticuloAutocomplete({
  clienteId,
  value,
  onChange,
}: {
  clienteId: string | null;
  value: Articulo | null;
  onChange: (a: Articulo | null) => void;
}) {
  const tituloDe = (a: Articulo) => a.descripcion?.trim() || a.codigo;
  const [q, setQ] = React.useState(value ? tituloDe(value) : "");
  const [open, setOpen] = React.useState(false);
  const [resultados, setResultados] = React.useState<Articulo[]>([]);

  // Sincronizar el texto del input cuando cambia el value desde afuera.
  React.useEffect(() => {
    setQ(value ? tituloDe(value) : "");
  }, [value]);

  React.useEffect(() => {
    if (!open || !clienteId) return;
    const t = setTimeout(async () => {
      const params = new URLSearchParams({ clienteId });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/articulos?${params}`);
      const data = await res.json();
      setResultados(data.articulos ?? []);
    }, 150);
    return () => clearTimeout(t);
  }, [q, open, clienteId]);

  return (
    <label className="flex flex-col gap-1 relative">
      <span className="text-sm font-medium text-slate-700">Producto</span>
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          if (value && e.target.value !== tituloDe(value)) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={clienteId ? "Buscar producto por nombre o código…" : "Elegí un cliente primero"}
        disabled={!clienteId}
      />
      {open && resultados.length > 0 && (
        <ul className="absolute z-10 top-full left-0 right-0 mt-1 rounded-xl bg-white shadow-lg border border-slate-200 max-h-80 overflow-y-auto">
          {resultados.map((a) => (
            <li key={a.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(a);
                  setQ(tituloDe(a));
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-100"
              >
                <div className="text-base font-semibold text-slate-900">{tituloDe(a)}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Código: {a.codigo} · {a.color} · {a.piezasPorHora} pzs/h
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function hoyISO(): string {
  const d = new Date();
  return toYMD(d);
}
function ahoraHHMM(): string {
  return toHHMM(new Date());
}
function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toHHMM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
function formatHora(d: Date) {
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}
function formatFechaHora(d: Date) {
  return fmtFechaHoraUtil(d);
}
