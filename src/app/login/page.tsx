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
        router.replace("/dashboard");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "PIN incorrecto");
      // Vibración táctil si el dispositivo la soporta.
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-200 p-6">
      <div className="flex flex-col items-center gap-10">
        <header className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">dao-ops</h1>
          <p className="mt-2 text-lg text-muted-foreground">Ingresá tu PIN de 6 dígitos</p>
        </header>

        <PinKeypad
          onComplete={submit}
          disabled={submitting}
          error={error}
          resetKey={resetKey}
        />
      </div>
    </main>
  );
}
