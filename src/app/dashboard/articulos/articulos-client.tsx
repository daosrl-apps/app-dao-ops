"use client";

import * as React from "react";
import { Upload, AlertTriangle, Search, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATALOGO_COLORES, SIN_COLOR } from "@/lib/color-parser";

interface Articulo {
  id: string;
  codigo: string;
  descripcion: string | null;
  superficieM2: number | null;
  perchas: number | null;
  tiempoVueltaMin: number | null;
  piezasPorVuelta: number | null;
  velLineaMtsMin: number | null;
  piezasPorHora: number;
  color: string;
  colorRevisar: boolean;
  configPerchas: string | null;
  cliente: { id: string; nombre: string };
}

/** Formatea un número opcional para la tabla (— si es null). */
function num(v: number | null | undefined, maxFrac = 3) {
  return v != null ? v.toLocaleString("es-AR", { maximumFractionDigits: maxFrac }) : "—";
}

export function ArticulosClient() {
  const [tab, setTab] = React.useState<"lista" | "importar">("lista");

  return (
    <section className="mx-auto w-full max-w-6xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Artículos</h1>
          <p className="text-slate-600">Catálogo de artículos + importación desde CSV.</p>
        </div>
      </div>

      <div className="mb-4 inline-flex rounded-xl bg-slate-200 p-1">
        <button
          onClick={() => setTab("lista")}
          className={
            tab === "lista"
              ? "px-4 py-2 rounded-lg bg-white text-slate-800 font-medium shadow"
              : "px-4 py-2 rounded-lg text-slate-600"
          }
        >
          Lista
        </button>
        <button
          onClick={() => setTab("importar")}
          className={
            tab === "importar"
              ? "px-4 py-2 rounded-lg bg-white text-slate-800 font-medium shadow"
              : "px-4 py-2 rounded-lg text-slate-600"
          }
        >
          Importar CSV
        </button>
      </div>

      {tab === "lista" ? <ListaArticulos /> : <ImportarCsv onDone={() => setTab("lista")} />}
    </section>
  );
}

// =============================================================================
// Lista de artículos
// =============================================================================

function ListaArticulos() {
  const [items, setItems] = React.useState<Articulo[]>([]);
  const [q, setQ] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [editMode, setEditMode] = React.useState(false);
  const [editing, setEditing] = React.useState<Articulo | null>(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    const res = await fetch(`/api/admin/articulos?${params}`);
    const data = await res.json();
    setItems(data.articulos ?? []);
    setLoading(false);
  }, [q]);

  React.useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código o descripción"
            className="pl-10"
          />
        </div>
        <Button
          variant={editMode ? "default" : "outline"}
          onClick={() => setEditMode((v) => !v)}
          className={editMode ? "bg-[#1627b1] text-white" : ""}
        >
          <Pencil className="h-4 w-4 mr-2" />
          {editMode ? "Salir de edición" : "Editar"}
        </Button>
      </div>
      {editMode && (
        <p className="mb-3 text-sm text-amber-700">
          Modo edición: buscá el artículo y tocá <b>Editar</b> en su fila. No se
          pueden cambiar cliente ni código.
        </p>
      )}

      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-x-auto">
        {loading ? (
          <p className="p-6 text-slate-500">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-slate-500">No hay artículos.</p>
        ) : (
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2">Color</th>
                <th className="px-3 py-2 text-right">Superficie (m²)</th>
                <th className="px-3 py-2 text-right">Perchas</th>
                <th className="px-3 py-2 text-right">T. vuelta (min)</th>
                <th className="px-3 py-2 text-right">Pzs/vuelta</th>
                <th className="px-3 py-2 text-right">Vel. línea (m/min)</th>
                <th className="px-3 py-2 text-right">Pzs/h</th>
                {editMode && <th className="px-3 py-2 text-right">Acción</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((a) => (
                <tr key={a.id} className={a.colorRevisar ? "bg-amber-50/60" : ""}>
                  <td className="px-3 py-2 text-slate-700">{a.cliente.nombre}</td>
                  <td className="px-3 py-2 font-medium text-slate-800">{a.codigo}</td>
                  <td className="px-3 py-2 text-slate-600 max-w-xs truncate">
                    {a.descripcion ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-slate-700">
                    {a.colorRevisar ? (
                      <span className="text-amber-700 font-medium">{a.color}</span>
                    ) : (
                      a.color
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">{num(a.superficieM2)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{num(a.perchas)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{num(a.tiempoVueltaMin)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{num(a.piezasPorVuelta)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{num(a.velLineaMtsMin)}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{num(a.piezasPorHora, 1)}</td>
                  {editMode && (
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="outline"
                        onClick={() => setEditing(a)}
                        className="h-8 px-3 text-sm"
                      >
                        <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <EditarArticuloModal
          articulo={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </>
  );
}

// =============================================================================
// Modal de edición de un artículo
// =============================================================================

function EditarArticuloModal({
  articulo,
  onClose,
  onSaved,
}: {
  articulo: Articulo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [descripcion, setDescripcion] = React.useState(articulo.descripcion ?? "");
  const [color, setColor] = React.useState(articulo.color);
  const [superficieM2, setSuperficieM2] = React.useState(str(articulo.superficieM2));
  const [perchas, setPerchas] = React.useState(str(articulo.perchas));
  const [tiempoVueltaMin, setTiempoVueltaMin] = React.useState(str(articulo.tiempoVueltaMin));
  const [piezasPorVuelta, setPiezasPorVuelta] = React.useState(str(articulo.piezasPorVuelta));
  const [velLineaMtsMin, setVelLineaMtsMin] = React.useState(str(articulo.velLineaMtsMin));
  const [piezasPorHora, setPiezasPorHora] = React.useState(str(articulo.piezasPorHora));
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Lista de colores: el catálogo + el actual si no estuviera (defensivo).
  const colores = React.useMemo(() => {
    const base = [...CATALOGO_COLORES, SIN_COLOR];
    return base.includes(articulo.color) ? base : [articulo.color, ...base];
  }, [articulo.color]);

  const guardar = async () => {
    const pph = Number(piezasPorHora);
    if (!Number.isFinite(pph) || pph <= 0) {
      setError("Piezas x hora debe ser un número mayor a 0.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/admin/articulos/${articulo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        descripcion: descripcion.trim() || null,
        color,
        superficieM2: numOrNull(superficieM2),
        perchas: numOrNull(perchas),
        tiempoVueltaMin: numOrNull(tiempoVueltaMin),
        piezasPorVuelta: numOrNull(piezasPorVuelta),
        velLineaMtsMin: numOrNull(velLineaMtsMin),
        piezasPorHora: pph,
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ? String(data.error) : "No se pudo guardar.");
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Editar artículo</h2>
            <p className="text-sm text-slate-500">
              {articulo.cliente.nombre} · <span className="font-medium">{articulo.codigo}</span>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Campo label="Cliente">
            <Input value={articulo.cliente.nombre} disabled />
          </Campo>
          <Campo label="Código">
            <Input value={articulo.codigo} disabled />
          </Campo>
          <Campo label="Descripción" full>
            <Input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </Campo>
          <Campo label="Color">
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
            >
              {colores.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Superficie (m²)">
            <Input type="number" step="any" value={superficieM2} onChange={(e) => setSuperficieM2(e.target.value)} />
          </Campo>
          <Campo label="Perchas">
            <Input type="number" step="any" value={perchas} onChange={(e) => setPerchas(e.target.value)} />
          </Campo>
          <Campo label="Tiempo x vuelta (min)">
            <Input type="number" step="any" value={tiempoVueltaMin} onChange={(e) => setTiempoVueltaMin(e.target.value)} />
          </Campo>
          <Campo label="Piezas x vuelta">
            <Input type="number" step="any" value={piezasPorVuelta} onChange={(e) => setPiezasPorVuelta(e.target.value)} />
          </Campo>
          <Campo label="Vel. línea (m/min)">
            <Input type="number" step="any" value={velLineaMtsMin} onChange={(e) => setVelLineaMtsMin(e.target.value)} />
          </Campo>
          <Campo label="Piezas x hora">
            <Input type="number" step="any" value={piezasPorHora} onChange={(e) => setPiezasPorHora(e.target.value)} />
          </Campo>
        </div>

        {error && <p className="mt-4 text-red-600 text-sm font-medium">{error}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={submitting} className="bg-emerald-600 text-white">
            {submitting ? "Guardando…" : "Guardar cambios"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Campo({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "col-span-2" : ""}>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

/** Number → string para inputs ("" si null). */
function str(v: number | null | undefined) {
  return v != null ? String(v) : "";
}

/** String de input → number o null (si vacío). */
function numOrNull(v: string): number | null {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// =============================================================================
// Importación CSV
// =============================================================================

interface PreviewResp {
  preview: true;
  totalFilas: number;
  filasOk: number;
  filasError: number;
  articulosSinColor: number;
  muestra: {
    lineaOriginal: number;
    cliente: string;
    codigo: string;
    color: string;
    colorRevisar: boolean;
    superficieM2: number | null;
    perchas: number | null;
    piezasPorHora: number;
  }[];
  errores: { lineaOriginal: number; motivo: string; preview: string }[];
}

interface ConfirmResp {
  ok: true;
  filasOk: number;
  filasError: number;
  articulosNuevos: number;
  articulosActualizados: number;
  articulosSinColor: number;
}

function ImportarCsv({ onDone }: { onDone: () => void }) {
  const [csvText, setCsvText] = React.useState<string | null>(null);
  const [nombreArchivo, setNombreArchivo] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<PreviewResp | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmed, setConfirmed] = React.useState<ConfirmResp | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const onFile = async (file: File) => {
    const text = await file.text();
    setCsvText(text);
    setNombreArchivo(file.name);
    setConfirmed(null);
    setError(null);
    setSubmitting(true);
    const res = await fetch("/api/admin/articulos/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: text, nombreArchivo: file.name }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("No se pudo procesar el archivo.");
      return;
    }
    setPreview((await res.json()) as PreviewResp);
  };

  const confirmar = async () => {
    if (!csvText) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch("/api/admin/articulos/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText, nombreArchivo, confirm: true }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError("No se pudo aplicar la importación.");
      return;
    }
    setConfirmed((await res.json()) as ConfirmResp);
  };

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6">
      <div className="flex items-start gap-4 mb-6">
        <Upload className="h-8 w-8 text-[#1627b1] shrink-0" />
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Importar catálogo desde CSV</h2>
          <p className="text-slate-600 text-sm">
            Se importa el CSV completo. Columnas:{" "}
            <code>Artículo, Cliente, Descripción, Superficie, Perchas, Tiempo x vuelta (min.),
            Piezas x vuelta, Vel. línea (mts. x min.), Piezas x hora</code>. Las columnas se mapean
            por <b>nombre de encabezado</b> (no por posición). El cálculo de duración usa{" "}
            <b>Piezas x hora</b>. Separador <code>,</code>, decimales con punto (ej. <code>0.45</code>).
            El color se extrae del nombre del artículo.
          </p>
        </div>
      </div>

      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
        }}
        className="block w-full text-sm text-slate-700
          file:mr-4 file:py-3 file:px-5
          file:rounded-xl file:border-0
          file:text-base file:font-medium
          file:bg-[#1627b1] file:text-white
          hover:file:bg-[#1627b1]/90 cursor-pointer"
      />

      {submitting && <p className="mt-4 text-slate-500">Procesando…</p>}
      {error && <p className="mt-4 text-red-600 font-medium">{error}</p>}

      {preview && !confirmed && (
        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tarjeta label="Filas totales" valor={preview.totalFilas} />
            <Tarjeta label="OK" valor={preview.filasOk} color="emerald" />
            <Tarjeta label="Errores" valor={preview.filasError} color="red" />
            <Tarjeta
              label="Sin color (revisar)"
              valor={preview.articulosSinColor}
              color="amber"
            />
          </div>

          {preview.errores.length > 0 && (
            <details className="rounded-xl bg-red-50 border border-red-200 p-4">
              <summary className="cursor-pointer text-red-800 font-medium">
                <AlertTriangle className="inline h-4 w-4 mr-1" />
                {preview.errores.length} fila(s) descartada(s)
              </summary>
              <ul className="mt-3 space-y-1 text-sm">
                {preview.errores.map((e, i) => (
                  <li key={i} className="text-red-900">
                    <b>Línea {e.lineaOriginal}:</b> {e.motivo} — <span className="text-red-700">{e.preview}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div>
            <h3 className="font-medium text-slate-700 mb-2">Vista previa (primeras filas)</h3>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">Línea</th>
                    <th className="px-3 py-2 text-left">Cliente</th>
                    <th className="px-3 py-2 text-left">Código</th>
                    <th className="px-3 py-2 text-right">m²</th>
                    <th className="px-3 py-2 text-right">Perchas</th>
                    <th className="px-3 py-2 text-right">Pzs/h</th>
                    <th className="px-3 py-2 text-left">Color</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.muestra.map((m) => (
                    <tr key={m.lineaOriginal} className={m.colorRevisar ? "bg-amber-50" : ""}>
                      <td className="px-3 py-2 text-slate-500">{m.lineaOriginal}</td>
                      <td className="px-3 py-2">{m.cliente}</td>
                      <td className="px-3 py-2">{m.codigo}</td>
                      <td className="px-3 py-2 text-right">
                        {m.superficieM2 != null ? m.superficieM2 : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{m.perchas != null ? m.perchas : "—"}</td>
                      <td className="px-3 py-2 text-right">{m.piezasPorHora}</td>
                      <td className="px-3 py-2">
                        {m.colorRevisar ? (
                          <span className="text-amber-700 font-medium">{m.color}</span>
                        ) : (
                          m.color
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setPreview(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} className="bg-emerald-600 text-white">
              Confirmar e importar {preview.filasOk} fila(s)
            </Button>
          </div>
        </div>
      )}

      {confirmed && (
        <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-200 p-5">
          <h3 className="font-semibold text-emerald-900">Importación aplicada</h3>
          <ul className="mt-2 text-sm text-emerald-900 list-disc list-inside">
            <li>{confirmed.articulosNuevos} artículo(s) nuevo(s)</li>
            <li>{confirmed.articulosActualizados} actualizado(s)</li>
            <li>{confirmed.articulosSinColor} sin color para revisar</li>
            <li>{confirmed.filasError} fila(s) con error</li>
          </ul>
          <div className="mt-4">
            <Button onClick={onDone} className="bg-[#1627b1] text-white">
              Ir al listado
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tarjeta({
  label,
  valor,
  color,
}: {
  label: string;
  valor: number;
  color?: "emerald" | "red" | "amber";
}) {
  const tone =
    color === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900"
      : color === "red"
        ? "border-red-200 bg-red-50 text-red-900"
        : color === "amber"
          ? "border-amber-200 bg-amber-50 text-amber-900"
          : "border-slate-200 bg-slate-50 text-slate-900";
  return (
    <div className={`rounded-xl border p-4 ${tone}`}>
      <p className="text-xs uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{valor}</p>
    </div>
  );
}
