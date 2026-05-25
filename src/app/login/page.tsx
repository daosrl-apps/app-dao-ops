"use client";

import * as React from "react";
import { PinKeypad } from "@/components/pin-keypad";
import { Button } from "@/components/ui/button";

type Modo = "pin" | "password";

export default function LoginPage() {
  const [modo, setModo] = React.useState<Modo>("pin");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#1627b1] p-6">
      <div className="flex flex-col items-center gap-8 w-full max-w-md">
        <header className="flex flex-col items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="DAO SRL" className="h-auto w-44 drop-shadow" />
          <p className="text-lg text-white/90 font-medium tracking-wide text-center">
            {modo === "pin"
              ? "Ingresá tu PIN de 6 dígitos"
              : "Iniciar sesión como supervisor / administrador"}
          </p>
        </header>

        <div className="rounded-3xl bg-white p-8 shadow-2xl w-full">
          {modo === "pin" ? <PinLoginForm /> : <PasswordLoginForm />}
        </div>

        <button
          type="button"
          className="text-white/80 hover:text-white text-sm underline underline-offset-4"
          onClick={() => setModo((m) => (m === "pin" ? "password" : "pin"))}
        >
          {modo === "pin"
            ? "Soy supervisor o administrador →"
            : "← Volver al ingreso por PIN"}
        </button>

        <footer className="text-xs text-white/60 tracking-wide">
          dao-ops · línea de producción
        </footer>
      </div>
    </main>
  );
}

function PinLoginForm() {
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [resetKey, setResetKey] = React.useState(0);

  const submit = async (pin: string) => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        window.location.assign("/dashboard");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "PIN incorrecto");
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(200);
      }
    } catch {
      setError("No se pudo conectar. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
      setResetKey((k) => k + 1);
    }
  };

  return (
    <PinKeypad onComplete={submit} disabled={submitting} error={error} resetKey={resetKey} />
  );
}

function PasswordLoginForm() {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        window.location.assign("/dashboard");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo iniciar sesión");
    } catch {
      setError("No se pudo conectar. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-gray-700">Usuario</span>
        <input
          type="text"
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          required
          minLength={3}
          maxLength={40}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="h-14 rounded-xl border border-gray-300 px-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#1627b1]"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-base font-medium text-gray-700">Contraseña</span>
        <input
          type="password"
          autoComplete="current-password"
          required
          minLength={8}
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-14 rounded-xl border border-gray-300 px-4 text-lg focus:outline-none focus:ring-2 focus:ring-[#1627b1]"
        />
      </label>

      {error && (
        <p className="text-destructive text-base font-medium" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="xl" disabled={submitting} className="bg-[#1627b1] text-white">
        {submitting ? "Ingresando…" : "Ingresar"}
      </Button>
    </form>
  );
}
