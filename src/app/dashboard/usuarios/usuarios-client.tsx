"use client";

import * as React from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type Rol = "OPERARIO" | "SUPERVISOR" | "ADMIN";

interface Usuario {
  id: string;
  name: string;
  username: string | null;
  role: Rol;
  isActive: boolean;
  lastLoginAt: string | null;
}

export function UsuariosClient() {
  const [users, setUsers] = React.useState<Usuario[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editando, setEditando] = React.useState<Usuario | null>(null);
  const [creando, setCreando] = React.useState(false);

  const reload = React.useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users ?? []);
    setLoading(false);
  }, []);

  React.useEffect(() => {
    reload();
  }, [reload]);

  const onDelete = async (u: Usuario) => {
    if (!confirm(`¿Dar de baja a "${u.name}"? Se invalidan sus sesiones activas.`)) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    if (res.ok) reload();
    else alert("No se pudo dar de baja.");
  };

  return (
    <section className="mx-auto w-full max-w-5xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Usuarios</h1>
          <p className="text-slate-600">Operarios usan PIN. Supervisor / admin usan usuario + contraseña.</p>
        </div>
        <Button onClick={() => setCreando(true)} size="lg" className="bg-[#1627b1] text-white">
          <Plus className="h-5 w-5 mr-2" /> Nuevo usuario
        </Button>
      </div>

      {(creando || editando) && (
        <UsuarioForm
          inicial={editando}
          onCancel={() => {
            setCreando(false);
            setEditando(null);
          }}
          onSaved={() => {
            setCreando(false);
            setEditando(null);
            reload();
          }}
        />
      )}

      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <p className="p-6 text-slate-500">Cargando…</p>
        ) : users.length === 0 ? (
          <p className="p-6 text-slate-500">No hay usuarios todavía.</p>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-100 text-sm uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Usuario / login</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{u.name}</td>
                  <td className="px-4 py-3 text-slate-700">{rolLabel(u.role)}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {u.role === "OPERARIO" ? "PIN" : u.username ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.isActive
                          ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-800"
                          : "rounded-full bg-slate-200 px-3 py-1 text-xs font-medium text-slate-600"
                      }
                    >
                      {u.isActive ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => setEditando(u)}
                        className="rounded-lg border border-slate-300 p-2 hover:bg-slate-100"
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(u)}
                        className="rounded-lg border border-red-200 p-2 text-red-600 hover:bg-red-50"
                        aria-label="Dar de baja"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function UsuarioForm({
  inicial,
  onCancel,
  onSaved,
}: {
  inicial: Usuario | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const esEdicion = !!inicial;
  const [name, setName] = React.useState(inicial?.name ?? "");
  const [role, setRole] = React.useState<Rol>(inicial?.role ?? "OPERARIO");
  const [pin, setPin] = React.useState("");
  const [username, setUsername] = React.useState(inicial?.username ?? "");
  const [password, setPassword] = React.useState("");
  const [isActive, setIsActive] = React.useState(inicial?.isActive ?? true);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload: Record<string, unknown> = { name, role, isActive };
    if (role === "OPERARIO") {
      if (pin) payload.pin = pin;
      if (!esEdicion && !pin) {
        setError("Hay que setear un PIN para el operario.");
        setSubmitting(false);
        return;
      }
    } else {
      if (username) payload.username = username;
      if (password) payload.password = password;
      if (!esEdicion && (!username || !password)) {
        setError("Username + password son obligatorios al crear supervisor / admin.");
        setSubmitting(false);
        return;
      }
    }

    const url = esEdicion ? `/api/admin/users/${inicial!.id}` : "/api/admin/users";
    const method = esEdicion ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSubmitting(false);
    if (res.ok) {
      onSaved();
      return;
    }
    const data = await res.json().catch(() => ({}));
    setError(typeof data.error === "string" ? data.error : "No se pudo guardar.");
  };

  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 rounded-2xl bg-white shadow-sm border border-slate-200 p-5"
    >
      <h2 className="text-xl font-semibold text-slate-800 mb-4">
        {esEdicion ? `Editar ${inicial!.name}` : "Nuevo usuario"}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Nombre</span>
          <Input
            required
            minLength={2}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-slate-700">Rol</span>
          <Select value={role} onChange={(e) => setRole(e.target.value as Rol)}>
            <option value="OPERARIO">Operario</option>
            <option value="SUPERVISOR">Supervisor</option>
            <option value="ADMIN">Administrador</option>
          </Select>
        </label>

        {role === "OPERARIO" ? (
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium text-slate-700">
              {esEdicion ? "Nuevo PIN (opcional — dejá vacío para no cambiar)" : "PIN (6 dígitos)"}
            </span>
            <Input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="123456"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </label>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">Usuario</span>
              <Input
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-slate-700">
                {esEdicion ? "Nueva contraseña (opcional)" : "Contraseña"}
              </span>
              <Input
                type="password"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </>
        )}

        {esEdicion && (
          <label className="flex items-center gap-3 sm:col-span-2 mt-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-5 w-5"
            />
            <span className="text-sm font-medium text-slate-700">Usuario activo</span>
          </label>
        )}
      </div>

      {error && <p className="mt-4 text-sm text-red-600 font-medium">{error}</p>}

      <div className="mt-5 flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="submit"
          className="bg-[#1627b1] text-white"
          disabled={submitting}
        >
          {submitting ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear usuario"}
        </Button>
      </div>
    </form>
  );
}

function rolLabel(r: Rol) {
  if (r === "ADMIN") return "Administrador";
  if (r === "SUPERVISOR") return "Supervisor";
  return "Operario";
}
