"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PinKeypad } from "@/components/pin-keypad";

export default function LoginPage() {
  const router = useRouter();
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
        // Navegamos por window.location en vez de router.replace porque queremos
        // que el server re-renderice el dashboard con el cookie nuevo. router.replace
        // a veces no dispara el server fetch si Next ya tenía la ruta cacheada.
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#1627b1] p-6">
      <div className="flex flex-col items-center gap-8">
        <header className="flex flex-col items-center gap-4">
          {/* SVG local: <img> directo evita el flow de next/image (más simple y
              suficiente porque la imagen ya es un asset estático del repo). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.svg"
            alt="DAO SRL"
            className="h-auto w-44 drop-shadow"
          />
          <p className="text-lg text-white/90 font-medium tracking-wide">
            Ingresá tu PIN de 6 dígitos
          </p>
        </header>

        <div className="rounded-3xl bg-white p-8 shadow-2xl">
          <PinKeypad
            onComplete={submit}
            disabled={submitting}
            error={error}
            resetKey={resetKey}
          />
        </div>

        <footer className="text-xs text-white/60 tracking-wide">
          dao-ops · línea de producción
        </footer>
      </div>
    </main>
  );
}
