"use client";

import * as React from "react";
import { Upload, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface Articulo {
  id: string;
  codigo: string;
  descripcion: string | null;
  piezasPorHora: number;
  color: string;
  colorRevisar: boolean;
  configPerchas: string | null;
  cliente: { id: string; nombre: string };
}

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
  "Sin color / Revisar",
];

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
  const [soloRevisar, setSoloRevisar] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (soloRevisar) params.set("revisar", "true");
    const res = await fetch(`/api/admin/articulos?${params}`);
    const data = await res.json();
    setItems(data.articulos ?? []);
    setLoading(false);
  }, [q, soloRevisar]);

  React.useEffect(() => {
    const t = setTimeout(reload, 200);
    return () => clearTimeout(t);
  }, [reload]);

  const onColorChange = async (a: Articulo, nuevo: string) => {
    const res = await fetch(`/api/admin/articulos/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color: nuevo }),
    });
    if (res.ok) {
      reload();
    } else {
      alert("No se pudo actualizar el color.");
    }
  };

  const onPerchasChange = async (a: Articulo, valor: string) => {
    const res = await fetch(`/api/admin/articulos/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configPerchas: valor || null }),
    });
    if (!res.ok) alert("No se pudo actualizar.");
  };

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
        <label className="inline-flex items-center gap-2 text-slate-700 text-sm font-medium">
          <input
            type="checkbox"
            checked={soloRevisar}
            onChange={(e) => setSoloRevisar(e.target.checked)}
            className="h-5 w-5"
          />
          Solo sin color (revisar)
        </label>
      </div>

      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-x-auto">
        {loading ? (
          <p className="p-6 text-slate-500">Cargando…</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-slate-500">No hay artículos.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Pzs/h</th>
                <th className="px-3 py-2">Color</th>
                <th className="px-3 py-2">Perchas</th>
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
                  <td className="px-3 py-2 text-right text-slate-700">
                    {a.piezasPorHora.toLocaleString("es-AR", { maximumFractionDigits: 1 })}
                  </td>
                  <td className="px-3 py-2">
                    <Select
                      value={a.color}
                      onChange={(e) => onColorChange(a, e.target.value)}
                      className={
                        a.colorRevisar ? "h-10 border-amber-400 text-amber-900 font-medium" : "h-10"
                      }
                    >
                      {CATALOGO_COLORES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      defaultValue={a.configPerchas ?? ""}
                      onBlur={(e) => {
                        if ((e.target.value || null) !== a.configPerchas)
                          onPerchasChange(a, e.target.value);
                      }}
                      className="h-10"
                      placeholder="—"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
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
            Columnas relevantes: <b>B</b> artículo, <b>C</b> cliente, <b>D</b> descripción,{" "}
            <b>J</b> piezas por hora. Se acepta separador <code>,</code> o <code>;</code>. El color
            se extrae del nombre del artículo.
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
