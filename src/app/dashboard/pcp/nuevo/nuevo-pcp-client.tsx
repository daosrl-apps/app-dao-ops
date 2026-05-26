"use client";

/**
 * Wizard de creación de PCP (2 pasos):
 *  1. Fecha + jornada.
 *  2. Carga de sub-ítems (LAVADO / PINTURA) con autocomplete + reordenamiento.
 *
 * Cada card representa un sub-ítem. Items "con lavado" se cargan como dos
 * sub-ítems separados (LAVADO + PINTURA). El optimizer agrupa todos los
 * LAVADO primero y después los PINTURA.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Droplets,
  Paintbrush,
  Pencil,
  Plus,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { proponerOrdenOptimo, planificar, type ItemPlan } from "@/lib/schedule";

type Jornada = "J_06_14" | "J_14_22" | "J_22_06" | "J_06_18" | "J_18_06";
type Tipo = "LAVADO" | "PINTURA";

const JORNADAS: { value: Jornada; label: string; horaInicio: number }[] = [
  { value: "J_06_14", label: "6 a 14 hs", horaInicio: 6 },
  { value: "J_14_22", label: "14 a 22 hs", horaInicio: 14 },
  { value: "J_22_06", label: "22 a 06 hs", horaInicio: 22 },
  { value: "J_06_18", label: "6 a 18 hs", horaInicio: 6 },
  { value: "J_18_06", label: "18 a 06 hs", horaInicio: 18 },
];

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

interface SubItemBorrador {
  tipo: Tipo;
  clienteId: string;
  clienteNombre: string;
  articuloId: string;
  articuloCodigo: string;
  articuloDescripcion: string | null;
  piezasPorHora: number;
  configPerchas: string | null;
  color: string;
  cantidad: number;
  // Solo aplican a LAVADO.
  piezasPorPercha: number;
  velocidadLavado: number;
}

export function NuevoPcpClient() {
  const router = useRouter();
  const [paso, setPaso] = React.useState<1 | 2>(1);
  const [fecha, setFecha] = React.useState<string>(() => new Date().toISOString().slice(0, 10));
  const [jornada, setJornada] = React.useState<Jornada>("J_06_14");
  const [items, setItems] = React.useState<SubItemBorrador[]>([]);
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

  const buildPlan = React.useCallback(
    (arr: SubItemBorrador[]): ItemPlan[] =>
      arr.map((it, idx) => ({
        index: idx,
        tipo: it.tipo,
        cantidadPiezas: it.cantidad,
        piezasPorHora: it.piezasPorHora,
        color: it.color,
        configPerchas: it.configPerchas,
        piezasPorPercha: it.tipo === "LAVADO" ? it.piezasPorPercha : null,
        velocidadLavado: it.tipo === "LAVADO" ? it.velocidadLavado : null,
      })),
    [],
  );

  const schedule = React.useMemo(() => {
    if (items.length === 0) return [];
    return planificar(buildPlan(items), inicioDate);
  }, [items, inicioDate, buildPlan]);

  const aplicarOptimizador = () => {
    if (items.length < 2) return;
    const orden = proponerOrdenOptimo(buildPlan(items));
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

  /**
   * Agrega 1 o 2 sub-ítems según el flag `tambienOtroTipo`. Si vino PINTURA
   * con flag, suma además un LAVADO equivalente; si vino LAVADO con flag,
   * suma además un PINTURA.
   */
  const sumarItems = (base: SubItemBorrador, tambienOtroTipo: boolean) => {
    const nuevos: SubItemBorrador[] = [];
    if (tambienOtroTipo) {
      const otroTipo: Tipo = base.tipo === "LAVADO" ? "PINTURA" : "LAVADO";
      // Por convención, el LAVADO va primero en el alta.
      if (otroTipo === "LAVADO") {
        nuevos.push({ ...base, tipo: "LAVADO" });
        nuevos.push(base);
      } else {
        nuevos.push(base);
        nuevos.push({ ...base, tipo: "PINTURA" });
      }
    } else {
      nuevos.push(base);
    }
    setItems((curr) => [...curr, ...nuevos]);
    setCreando(false);
    if (!ordenManual) {
      queueMicrotask(() => {
        setItems((curr) => {
          if (curr.length < 2) return curr;
          const orden = proponerOrdenOptimo(buildPlan(curr));
          return orden.map((i) => curr[i]);
        });
      });
    }
  };

  const editarItem = (idx: number, nuevo: SubItemBorrador) => {
    setItems((curr) => {
      const next = [...curr];
      next[idx] = nuevo;
      return next;
    });
    setEditandoIdx(null);
  };

  const finalizar = async () => {
    setSubmitting(true);
    setError(null);
    // El backend acepta items con incluyeLavado. Acá ya vienen como sub-ítems
    // separados, así que mandamos cada uno como un item con `incluyeLavado=false`
    // y, en caso de LAVADO, los datos de lavado + cantidad. El POST /api/pcp
    // genera un row por cada sub-ítem y lo persiste con su tipo.
    const body = {
      inicio: inicioDate.toISOString(),
      jornada,
      ordenManual,
      items: items.map((it) => ({
        articuloId: it.articuloId,
        color: it.color,
        cantidad: it.cantidad,
        // Trick: si tipo=LAVADO, mandamos incluyeLavado=true y los datos del
        // lavado; el server crea el ítem LAVADO. Si tipo=PINTURA, mandamos
        // incluyeLavado=false: el server crea solo el ítem PINTURA.
        incluyeLavado: it.tipo === "LAVADO",
        piezasPorPercha: it.tipo === "LAVADO" ? it.piezasPorPercha : null,
        velocidadLavado: it.tipo === "LAVADO" ? it.velocidadLavado : null,
        soloLavado: it.tipo === "LAVADO",
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
            disabled={items.length >= 12}
          >
            <Plus className="h-5 w-5 mr-2" /> Agregar ítem
          </Button>
          <Button
            onClick={aplicarOptimizador}
            variant="outline"
            size="lg"
            disabled={items.length < 2}
            title="Agrupa todos los LAVADO primero, después PINTURA optimizando cambios"
          >
            <Wand2 className="h-5 w-5 mr-2" /> Proponer orden óptimo
          </Button>
        </div>
      )}

      {creando && (
        <ItemForm
          modo="alta"
          inicial={null}
          onCancel={() => setCreando(false)}
          onSaveAlta={sumarItems}
          onSaveEdicion={() => {}}
        />
      )}

      {editandoIdx !== null && (
        <ItemForm
          modo="edicion"
          inicial={items[editandoIdx]}
          onCancel={() => setEditandoIdx(null)}
          onSaveAlta={() => {}}
          onSaveEdicion={(it) => editarItem(editandoIdx, it)}
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
  item: SubItemBorrador;
  schedule?: { inicio: Date; fin: Date; cambioSeg: number };
  isFirst: boolean;
  isLast: boolean;
  onUp: () => void;
  onDown: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isLavado = item.tipo === "LAVADO";
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
        <div className="flex items-center gap-2 mb-1">
          <span
            className={
              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide " +
              (isLavado
                ? "bg-sky-100 text-sky-800"
                : "bg-violet-100 text-violet-800")
            }
          >
            {isLavado ? <Droplets className="h-3 w-3" /> : <Paintbrush className="h-3 w-3" />}
            {isLavado ? "Lavado" : "Pintura"}
          </span>
          <span className="text-xs uppercase tracking-wider text-slate-500">
            {item.clienteNombre}
          </span>
        </div>
        <p className="text-xl font-black tracking-tight text-slate-900 leading-tight">
          {item.articuloDescripcion?.trim() || item.articuloCodigo}
        </p>
        <div className="mt-1 text-sm text-slate-600 flex flex-wrap gap-x-3 gap-y-1">
          <span>
            <b>{item.cantidad}</b> piezas
            {!isLavado && (
              <>
                {" "}
                · <b>{item.color}</b>
              </>
            )}
          </span>
          {isLavado && (
            <span>
              {item.piezasPorPercha}/percha · {item.velocidadLavado} m/s
            </span>
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
// ItemForm
// =============================================================================

function ItemForm({
  modo,
  inicial,
  onCancel,
  onSaveAlta,
  onSaveEdicion,
}: {
  modo: "alta" | "edicion";
  inicial: SubItemBorrador | null;
  onCancel: () => void;
  onSaveAlta: (base: SubItemBorrador, tambienOtroTipo: boolean) => void;
  onSaveEdicion: (it: SubItemBorrador) => void;
}) {
  const [tipo, setTipo] = React.useState<Tipo>(inicial?.tipo ?? "PINTURA");
  const [cliente, setCliente] = React.useState<Cliente | null>(
    inicial ? { id: inicial.clienteId, nombre: inicial.clienteNombre } : null,
  );
  const [articulo, setArticulo] = React.useState<Articulo | null>(null);
  const [color, setColor] = React.useState<string>(inicial?.color ?? "");
  const [cantidad, setCantidad] = React.useState<string>(
    inicial ? String(inicial.cantidad) : "",
  );
  const [piezasPorPercha, setPiezasPorPercha] = React.useState<number>(
    inicial?.piezasPorPercha ?? 1,
  );
  const [velocidadLavado, setVelocidadLavado] = React.useState<number>(
    inicial?.velocidadLavado ?? 1.0,
  );
  const [tambienOtroTipo, setTambienOtroTipo] = React.useState<boolean>(modo === "alta");

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
    const base: SubItemBorrador = {
      tipo,
      clienteId: cliente.id,
      clienteNombre: cliente.nombre,
      articuloId: articulo.id,
      articuloCodigo: articulo.codigo,
      articuloDescripcion: articulo.descripcion,
      piezasPorHora: articulo.piezasPorHora,
      configPerchas: articulo.configPerchas,
      color: color || articulo.color,
      cantidad: Math.trunc(c),
      piezasPorPercha,
      velocidadLavado,
    };
    if (modo === "alta") onSaveAlta(base, tambienOtroTipo);
    else onSaveEdicion(base);
  };

  return (
    <div className="mb-6 rounded-2xl bg-white shadow-sm border border-slate-200 p-5">
      <h2 className="text-xl font-semibold text-slate-800 mb-4">
        {modo === "edicion" ? "Editar ítem" : "Nuevo ítem"}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2 flex gap-2">
          <button
            type="button"
            onClick={() => setTipo("PINTURA")}
            disabled={modo === "edicion"}
            className={
              "flex-1 h-14 rounded-xl border-2 font-bold inline-flex items-center justify-center gap-2 " +
              (tipo === "PINTURA"
                ? "border-violet-500 bg-violet-50 text-violet-900"
                : "border-slate-300 bg-white text-slate-600") +
              (modo === "edicion" ? " opacity-60 cursor-not-allowed" : "")
            }
          >
            <Paintbrush className="h-5 w-5" /> Pintura
          </button>
          <button
            type="button"
            onClick={() => setTipo("LAVADO")}
            disabled={modo === "edicion"}
            className={
              "flex-1 h-14 rounded-xl border-2 font-bold inline-flex items-center justify-center gap-2 " +
              (tipo === "LAVADO"
                ? "border-sky-500 bg-sky-50 text-sky-900"
                : "border-slate-300 bg-white text-slate-600") +
              (modo === "edicion" ? " opacity-60 cursor-not-allowed" : "")
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

        {modo === "alta" && (
          <label className="md:col-span-2 flex items-center gap-3 rounded-xl border border-slate-300 p-3 bg-slate-50">
            <input
              type="checkbox"
              checked={tambienOtroTipo}
              onChange={(e) => setTambienOtroTipo(e.target.checked)}
              className="h-5 w-5"
            />
            <span className="text-base text-slate-700">
              {tipo === "PINTURA"
                ? "Crear también su lavado (genera 2 sub-ítems)"
                : "Crear también su pintura (genera 2 sub-ítems)"}
            </span>
          </label>
        )}
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> Cancelar
        </Button>
        <Button
          onClick={guardar}
          disabled={
            !cliente ||
            !articulo ||
            !cantidad ||
            (tipo === "PINTURA" && !color)
          }
          className="bg-[#1627b1] text-white"
          size="lg"
        >
          <Check className="h-5 w-5 mr-2" />{" "}
          {modo === "edicion" ? "Guardar" : "Cargar ítem"}
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
