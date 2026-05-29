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
import { AlertTriangle, Check, Droplets, Paintbrush, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatFechaHora as fmtFechaHoraUtil } from "@/lib/utils";

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
  razon: "base" | "cambio_color" | "sin_orden_previa";
  ordenAnterior: { numero: number; finTeorico: string; color: string; tipo: Tipo } | null;
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

  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [splitInfo, setSplitInfo] = React.useState<SplitInfo | null>(null);

  // Refrescamos la sugerencia cada vez que cambia tipo/color (afecta el gap).
  React.useEffect(() => {
    let cancelled = false;
    const fetchSugerencia = async () => {
      const params = new URLSearchParams({ tipo, color: color || "" });
      const res = await fetch(`/api/ordenes/sugerencia?${params}`);
      if (!res.ok) return;
      const data: Sugerencia = await res.json();
      if (cancelled) return;
      setSugerencia(data);
      const d = new Date(data.sugerido);
      setInicioFecha(toYMD(d));
      setInicioHora(toHHMM(d));
    };
    fetchSugerencia();
    return () => {
      cancelled = true;
    };
  }, [tipo, color]);

  const inicioISO = React.useMemo(() => {
    const [y, m, d] = inicioFecha.split("-").map(Number);
    const [h, mi] = inicioHora.split(":").map(Number);
    return new Date(y, m - 1, d, h, mi, 0, 0).toISOString();
  }, [inicioFecha, inicioHora]);

  // Validación: el inicio elegido no puede ser menor al sugerido (= mínimo).
  const inicioTooEarly = React.useMemo(() => {
    if (!sugerencia) return false;
    return new Date(inicioISO).getTime() < new Date(sugerencia.minimo).getTime() - 60_000;
  }, [inicioISO, sugerencia]);

  const guardar = async (split?: { cantidadHoy: number }) => {
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
      split,
    };
    const res = await fetch("/api/ordenes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setSubmitting(false);

    if (res.status === 409 && typeof data.minimo === "string") {
      // Overlap: el backend nos manda el mínimo y nosotros saltamos el inicio.
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

  const puedeGuardar =
    !!articulo &&
    !!cantidad &&
    Number(cantidad) > 0 &&
    !inicioTooEarly &&
    (tipo !== "PINTURA" || !!color || !!articulo?.color);

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
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Velocidad lavado (m/s)</span>
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

          {sugerencia && <SugerenciaInfo sugerencia={sugerencia} />}

          {inicioTooEarly && sugerencia && (
            <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 border border-red-200 p-3">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">
                No podés iniciar antes de las{" "}
                <b>{formatFechaHora(new Date(sugerencia.minimo))}</b> (se solaparía con la OT
                anterior). Podés empujarlo más tarde si querés dejar un hueco.
              </p>
            </div>
          )}

          <p className="text-xs text-slate-500 mt-2">
            Si la OT no entra en el turno, el sistema va a preguntarte cómo partirla.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
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

        {error && <p className="text-red-600 font-medium">{error}</p>}
      </div>

      {splitInfo && (
        <SplitDialog
          cantidadTotal={Number(cantidad)}
          info={splitInfo}
          onCancel={() => setSplitInfo(null)}
          onConfirm={async (cantidadHoy) => {
            setSplitInfo(null);
            await guardar({ cantidadHoy });
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

function SugerenciaInfo({ sugerencia }: { sugerencia: Sugerencia }) {
  if (sugerencia.razon === "sin_orden_previa") {
    return (
      <p className="mt-2 text-xs text-slate-500">
        No hay OTs activas. Podés elegir cualquier horario.
      </p>
    );
  }
  const prev = sugerencia.ordenAnterior;
  const gapMin = Math.round(sugerencia.gapSeg / 60);
  const motivo = sugerencia.razon === "cambio_color" ? "cambio de color (+30)" : "cambio de gancheras";
  return (
    <p className="mt-2 text-xs text-slate-600">
      Sugerido: <b>{formatFechaHora(new Date(sugerencia.sugerido))}</b> ={" "}
      fin de OT #{prev?.numero} ({formatFechaHora(new Date(prev!.finTeorico))}) + {gapMin} min ({motivo}).
    </p>
  );
}

// =============================================================================
// SplitDialog
// =============================================================================

function SplitDialog({
  cantidadTotal,
  info,
  onCancel,
  onConfirm,
  submitting,
}: {
  cantidadTotal: number;
  info: SplitInfo;
  onCancel: () => void;
  onConfirm: (cantidadHoy: number) => void;
  submitting: boolean;
}) {
  const [cantidadHoy, setCantidadHoy] = React.useState<string>(String(info.sugerenciaCantidadHoy));
  const valido =
    /^\d+$/.test(cantidadHoy) &&
    Number(cantidadHoy) > 0 &&
    Number(cantidadHoy) < cantidadTotal;
  const resto = valido ? cantidadTotal - Number(cantidadHoy) : null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-6 z-50">
      <div className="bg-white text-slate-900 rounded-2xl w-full max-w-lg p-6 shadow-2xl">
        <h2 className="text-2xl font-black mb-2">La OT no entra en el turno</h2>
        <p className="text-slate-600 mb-4">
          El turno termina a las{" "}
          <b>{formatHora(new Date(info.finTurno))}</b>. La próxima OT puede continuar el{" "}
          <b>{formatFechaHora(new Date(info.proximoInicio))}</b>.
        </p>
        <p className="text-slate-700 mb-3 text-sm">
          Indicá cuántas piezas se completan en este turno. El resto se carga automáticamente como
          una OT de continuación.
        </p>

        <label className="flex flex-col gap-1 mb-4">
          <span className="text-sm font-medium text-slate-700">
            Cantidad que se completa hoy (de {cantidadTotal})
          </span>
          <Input
            inputMode="numeric"
            pattern="\d*"
            autoFocus
            value={cantidadHoy}
            onChange={(e) => setCantidadHoy(e.target.value.replace(/\D/g, ""))}
            className="h-14 text-2xl text-right font-medium"
          />
        </label>

        {resto !== null && (
          <p className="text-sm text-slate-600 mb-4 rounded-xl bg-slate-50 border border-slate-200 p-3">
            Hoy: <b>{cantidadHoy}</b> piezas · Continuación: <b>{resto}</b> piezas.
          </p>
        )}

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            <X className="h-4 w-4 mr-1" /> Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(Number(cantidadHoy))}
            disabled={!valido || submitting}
            className="bg-[#1627b1] text-white"
            size="lg"
          >
            <Check className="h-5 w-5 mr-2" />
            Partir y crear las 2 OTs
          </Button>
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
