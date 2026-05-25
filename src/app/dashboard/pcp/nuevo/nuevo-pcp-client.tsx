"use client";

/**
 * Wizard de creación de PCP (2 pasos):
 *  1. Fecha + jornada.
 *  2. Carga de ítems con autocomplete + reordenamiento.
 *
 * Reordenamiento: usamos botones ↑/↓ (más confiables en tablet que el drag &
 * drop táctil nativo del navegador, y suficientes para ≤8 ítems). En cuanto el
 * supervisor mueve un ítem manualmente, `ordenManual` queda en true y el
 * sistema deja de proponer reorden.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Pencil,
  Plus,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { proponerOrdenOptimo, type ItemPlan } from "@/lib/schedule";
import { planificar } from "@/lib/schedule";

type Jornada = "J_06_14" | "J_14_22" | "J_22_06" | "J_06_18" | "J_18_06";

const JORNADAS: { value: Jornada; label: string; horaInicio: number }[] = [
  { value: "J_06_14", label: "6 a 14 hs", horaInicio: 6 },
  { value: "J_14_22", label: "14 a 22 hs", horaInicio: 14 },
  { value: "J_22_06", label: "22 a 06 hs", horaInicio: 22 },
  { value: "J_06_18", label: "6 a 18 hs", horaInicio: 6 },
  { value: "J_18_06", label: "18 a 06 hs", horaInicio: 18 },
];

const CATALOGO_COLORES = [
  "Aluminio",
  "Amarillo",
  "Amarillo maíz",
  "Azul",
  "Beige",
  "Blanco",
  "Blanco brillante",
  "Estrellita",
  "Fluor naranja",
  "Fluor rosa",
  "Fluor verde",
  "Galv / galvanizado",
  "Grafito",
  "Gris",
  "Gris Shell",
  "Gris Stara",
  "Gris topo",
  "Marrón",
  "Naranja",
  "Negro",
  "Negro tex",
  "Negro texturado",
  "Negro s/mate",
  "Ocre",
  "Platil",
  "Rojo",
  "Rosa",
  "Shell",
  "Verde",
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

interface ItemBorrador {
  clienteId: string;
  clienteNombre: string;
  articuloId: string;
  articuloCodigo: string;
  piezasPorHora: number;
  configPerchas: string | null;
  color: string;
  cantidad: number;
  incluyeLavado: boolean;
  piezasPorPercha: number;
  velocidadLavado: number;
}

export function NuevoPcpClient() {
  const router = useRouter();
  const [paso, setPaso] = React.useState<1 | 2>(1);
  const [fecha, setFecha] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [jornada, setJornada] = React.useState<Jornada>("J_06_14");
  const [items, setItems] = React.useState<ItemBorrador[]>([]);
  const [ordenManual, setOrdenManual] = React.useState(false);
  const [editandoIdx, setEditandoIdx] = React.useState<number | null>(null);
  const [creando, setCreando] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const inicioDate = React.useMemo(() => {
    const [y, m, d] = fecha.split("-").map(Number);
    const horaInicio = JORNADAS.find((j) => j.value === jornada)!.horaInicio;
    return new Date(y, m - 1, d, horaInicio, 0, 0, 0);
  }, [fecha, jornada]);

  const schedule = React.useMemo(() => {
    if (items.length === 0) return [];
    const plan: ItemPlan[] = items.map((it, idx) => ({
      index: idx,
      cantidadPiezas: it.cantidad,
      piezasPorHora: it.piezasPorHora,
      color: it.color,
      configPerchas: it.configPerchas,
      incluyeLavado: it.incluyeLavado,
      piezasPorPercha: it.incluyeLavado ? it.piezasPorPercha : null,
      velocidadLavado: it.incluyeLavado ? it.velocidadLavado : null,
    }));
    return planificar(plan, inicioDate);
  }, [items, inicioDate]);

  const aplicarOptimizador = () => {
    if (items.length < 2) return;
    const plan: ItemPlan[] = items.map((it, idx) => ({
      index: idx,
      cantidadPiezas: it.cantidad,
      piezasPorHora: it.piezasPorHora,
      color: it.color,
      configPerchas: it.configPerchas,
      incluyeLavado: it.incluyeLavado,
      piezasPorPercha: it.incluyeLavado ? it.piezasPorPercha : null,
      velocidadLavado: it.incluyeLavado ? it.velocidadLavado : null,
    }));
    const orden = proponerOrdenOptimo(plan);
    setItems((curr) => orden.map((i) => curr[i]));
    setOrdenManual(false);
  };

  const swap = (i: number, j: number) => {
    if (j < 0 || j >= items.length) return;
    setItems((curr) => {
      const next = [...curr];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setOrdenManual(true);
  };

  const eliminar = (i: number) => {
    setItems((curr) => curr.filter((_, idx) => idx !== i));
  };

  const upsertItem = (nuevo: ItemBorrador) => {
    setItems((curr) => {
      if (editandoIdx !== null) {
        const next = [...curr];
        next[editandoIdx] = nuevo;
        return next;
      }
      return [...curr, nuevo];
    });
    setEditandoIdx(null);
    setCreando(false);
    // Si el usuario no había reordenado a mano, re-optimizamos al sumar/editar.
    if (!ordenManual) {
      // Re-aplicar optimizador en el próximo render via effect.
      queueMicrotask(() => {
        setItems((curr) => {
          if (curr.length < 2) return curr;
          const plan: ItemPlan[] = curr.map((it, idx) => ({
            index: idx,
            cantidadPiezas: it.cantidad,
            piezasPorHora: it.piezasPorHora,
            color: it.color,
            configPerchas: it.configPerchas,
            incluyeLavado: it.incluyeLavado,
            piezasPorPercha: it.incluyeLavado ? it.piezasPorPercha : null,
            velocidadLavado: it.incluyeLavado ? it.velocidadLavado : null,
          }));
          const orden = proponerOrdenOptimo(plan);
          return orden.map((i) => curr[i]);
        });
      });
    }
  };

  const finalizar = async () => {
    setSubmitting(true);
    setError(null);
    const body = {
      inicio: inicioDate.toISOString(),
      jornada,
      ordenManual,
      items: items.map((it) => ({
        articuloId: it.articuloId,
        color: it.color,
        cantidad: it.cantidad,
        incluyeLavado: it.incluyeLavado,
        piezasPorPercha: it.incluyeLavado ? it.piezasPorPercha : null,
        velocidadLavado: it.incluyeLavado ? it.velocidadLavado : null,
      })),
    };
    const res = await fetch("/api/pcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSubmitting(false);
    if (res.ok) {
      router.push("/dashboard/pcp");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "No se pudo guardar el PCP.");
    }
  };

  if (paso === 1) {
    return (
      <section className="mx-auto w-full max-w-2xl p-6">
        <h1 className="text-3xl font-bold text-slate-800 mb-6">Nueva orden (PCP)</h1>
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 space-y-5">
          <label className="flex flex-col gap-2">
            <span className="text-base font-medium text-slate-700">Fecha de la jornada</span>
            <Input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="h-14 text-lg"
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className="text-base font-medium text-slate-700">Jornada laboral</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {JORNADAS.map((j) => (
                <button
                  key={j.value}
                  onClick={() => setJornada(j.value)}
                  className={
                    jornada === j.value
                      ? "h-14 rounded-xl bg-[#1627b1] text-white text-lg font-medium shadow"
                      : "h-14 rounded-xl border border-slate-300 bg-white text-slate-700 text-lg"
                  }
                >
                  {j.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setPaso(2)} size="xl" className="bg-[#1627b1] text-white">
              <Check className="h-5 w-5 mr-2" /> OK
            </Button>
          </div>
        </div>
      </section>
    );
  }

  // Paso 2
  return (
    <section className="mx-auto w-full max-w-5xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Cargar ítems</h1>
          <p className="text-slate-600">
            {new Date(fecha).toLocaleDateString("es-AR", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}{" "}
            · {JORNADAS.find((j) => j.value === jornada)!.label}
          </p>
        </div>
        <Button variant="outline" onClick={() => setPaso(1)}>
          ← Cambiar jornada
        </Button>
      </div>

      {/* Lista de ítems cargados */}
      <div className="space-y-3 mb-6">
        {items.map((it, idx) => (
          <ItemCard
            key={idx}
            item={it}
            schedule={schedule[idx]}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
            onUp={() => swap(idx, idx - 1)}
            onDown={() => swap(idx, idx + 1)}
            onEdit={() => {
              setEditandoIdx(idx);
              setCreando(false);
            }}
            onDelete={() => eliminar(idx)}
          />
        ))}
      </div>

      {!creando && editandoIdx === null && (
        <div className="flex flex-wrap gap-3 mb-6">
          <Button
            onClick={() => setCreando(true)}
            size="lg"
            className="bg-[#1627b1] text-white"
            disabled={items.length >= 8}
          >
            <Plus className="h-5 w-5 mr-2" /> Agregar ítem
          </Button>
          <Button
            onClick={aplicarOptimizador}
            variant="outline"
            size="lg"
            disabled={items.length < 2}
            title="Reordena agrupando por color y minimizando cambios"
          >
            <Wand2 className="h-5 w-5 mr-2" /> Proponer orden óptimo
          </Button>
        </div>
      )}

      {(creando || editandoIdx !== null) && (
        <ItemForm
          inicial={editandoIdx !== null ? items[editandoIdx] : null}
          onCancel={() => {
            setEditandoIdx(null);
            setCreando(false);
          }}
          onSave={upsertItem}
        />
      )}

      {items.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-600">
                {items.length} ítem(s) · orden{" "}
                <b>{ordenManual ? "manual" : "automático"}</b>
              </p>
              {schedule.length > 0 && (
                <p className="text-sm text-slate-700 mt-1">
                  Fin teórico del PCP:{" "}
                  <b>{schedule[schedule.length - 1].fin.toLocaleString("es-AR")}</b>
                </p>
              )}
            </div>
            <Button
              onClick={finalizar}
              size="xl"
              disabled={submitting || items.length === 0}
              className="bg-emerald-600 text-white"
            >
              <Check className="h-5 w-5 mr-2" />
              {submitting ? "Guardando…" : "Finalizar PCP"}
            </Button>
          </div>
          {error && <p className="mt-3 text-red-600 font-medium">{error}</p>}
        </div>
      )}
    </section>
  );
}

// =============================================================================
// ItemCard
// =============================================================================

function ItemCard({
  item,
  schedule,
  isFirst,
  isLast,
  onUp,
  onDown,
  onEdit,
  onDelete,
}: {
  item: ItemBorrador;
  schedule?: { inicio: Date; fin: Date; cambioSeg: number };
  isFirst: boolean;
  isLast: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-stretch rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      <div className="flex flex-col bg-slate-50 border-r border-slate-200">
        <button
          onClick={onUp}
          disabled={isFirst}
          className="h-1/2 px-3 hover:bg-slate-200 disabled:opacity-30"
          aria-label="Subir"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
        <button
          onClick={onDown}
          disabled={isLast}
          className="h-1/2 px-3 hover:bg-slate-200 disabled:opacity-30 border-t border-slate-200"
          aria-label="Bajar"
        >
          <ArrowDown className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 p-4">
        <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
          <span className="text-lg font-semibold text-slate-800">{item.clienteNombre}</span>
          <span className="text-slate-500">·</span>
          <span className="text-lg text-slate-700">{item.articuloCodigo}</span>
        </div>
        <div className="mt-1 text-sm text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
          <span>
            <b>{item.cantidad}</b> piezas · <b>{item.color}</b>
          </span>
          {item.incluyeLavado ? (
            <span>
              Lavado: {item.piezasPorPercha}/percha · {item.velocidadLavado} m/s
            </span>
          ) : (
            <span>Sin lavado</span>
          )}
        </div>
        {schedule && (
          <p className="mt-2 text-xs text-slate-500">
            {schedule.inicio.toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            →{" "}
            {schedule.fin.toLocaleTimeString("es-AR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            {schedule.cambioSeg > 0 && (
              <span className="ml-2 text-amber-700">
                · cambio {Math.round(schedule.cambioSeg / 60)} min
              </span>
            )}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={onEdit}
          className="rounded-lg border border-slate-300 p-2 hover:bg-slate-100"
          aria-label="Editar"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
          aria-label="Borrar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// ItemForm (alta/edición de un ítem con autocomplete)
// =============================================================================

function ItemForm({
  inicial,
  onCancel,
  onSave,
}: {
  inicial: ItemBorrador | null;
  onCancel: () => void;
  onSave: (it: ItemBorrador) => void;
}) {
  const [cliente, setCliente] = React.useState<Cliente | null>(
    inicial ? { id: inicial.clienteId, nombre: inicial.clienteNombre } : null,
  );
  const [articulo, setArticulo] = React.useState<Articulo | null>(null);
  const [color, setColor] = React.useState<string>(inicial?.color ?? "");
  const [cantidad, setCantidad] = React.useState<string>(
    inicial ? String(inicial.cantidad) : "",
  );
  const [incluyeLavado, setIncluyeLavado] = React.useState<boolean>(
    inicial?.incluyeLavado ?? true,
  );
  const [piezasPorPercha, setPiezasPorPercha] = React.useState<number>(
    inicial?.piezasPorPercha ?? 1,
  );
  const [velocidadLavado, setVelocidadLavado] = React.useState<number>(
    inicial?.velocidadLavado ?? 1.0,
  );

  // Pre-cargar el articulo si estamos editando.
  React.useEffect(() => {
    if (inicial && !articulo) {
      fetch(`/api/admin/articulos?clienteId=${inicial.clienteId}`)
        .then((r) => r.json())
        .then((d: { articulos: Articulo[] }) => {
          const found = d.articulos.find((a) => a.id === inicial.articuloId);
          if (found) setArticulo(found);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guardar = () => {
    if (!cliente || !articulo) return;
    const c = Number(cantidad);
    if (!Number.isFinite(c) || c <= 0) return;
    onSave({
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      articuloId: articulo.id,
      articuloCodigo: articulo.codigo,
      piezasPorHora: articulo.piezasPorHora,
      configPerchas: articulo.configPerchas,
      color: color || articulo.color,
      cantidad: Math.trunc(c),
      incluyeLavado,
      piezasPorPercha,
      velocidadLavado,
    });
  };

  return (
    <div className="mb-6 rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
      <h2 className="text-xl font-semibold text-slate-800 mb-4">
        {inicial ? "Editar ítem" : "Nuevo ítem"}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <label className="md:col-span-2 flex items-center justify-between rounded-xl border border-slate-300 p-4">
          <span className="text-base font-medium text-slate-700">Incluye lavado</span>
          <button
            type="button"
            onClick={() => setIncluyeLavado((v) => !v)}
            className={
              incluyeLavado
                ? "relative h-9 w-16 rounded-full bg-emerald-500 transition"
                : "relative h-9 w-16 rounded-full bg-slate-300 transition"
            }
            aria-pressed={incluyeLavado}
            aria-label="Incluye lavado"
          >
            <span
              className={
                incluyeLavado
                  ? "absolute left-8 top-1 h-7 w-7 rounded-full bg-white shadow transition"
                  : "absolute left-1 top-1 h-7 w-7 rounded-full bg-white shadow transition"
              }
            />
          </button>
        </label>

        {incluyeLavado && (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Piezas por percha</span>
              <Select
                value={piezasPorPercha}
                onChange={(e) => setPiezasPorPercha(Number(e.target.value))}
              >
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
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
                  <option key={v} value={v}>
                    {v.toFixed(1)}
                  </option>
                ))}
              </Select>
            </label>
          </>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancelar
        </Button>
        <Button
          onClick={guardar}
          disabled={!cliente || !articulo || !cantidad || !color}
          className="bg-[#1627b1] text-white"
          size="lg"
        >
          <Check className="h-5 w-5 mr-2" /> {inicial ? "Guardar" : "Cargar ítem"}
        </Button>
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

function ArticuloAutocomplete({
  clienteId,
  value,
  onChange,
}: {
  clienteId: string | null;
  value: Articulo | null;
  onChange: (a: Articulo | null) => void;
}) {
  const [q, setQ] = React.useState(value?.codigo ?? "");
  const [open, setOpen] = React.useState(false);
  const [resultados, setResultados] = React.useState<Articulo[]>([]);

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
          if (value && e.target.value !== value.codigo) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={clienteId ? "Buscar producto…" : "Elegí un cliente primero"}
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
                  setQ(a.codigo);
                  setOpen(false);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-100"
              >
                <div className="text-base font-medium">{a.codigo}</div>
                {a.descripcion && (
                  <div className="text-xs text-slate-500">{a.descripcion}</div>
                )}
                <div className="text-xs text-slate-500">
                  {a.color} · {a.piezasPorHora} pzs/h
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
