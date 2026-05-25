import { CheckCircle2 } from "lucide-react";
import { getCurrentSessionClaims } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const claims = await getCurrentSessionClaims();

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-[#1627b1] px-6 py-4 text-white shadow">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="DAO SRL" className="h-12 w-auto" />
        <div className="text-right">
          <p className="text-sm font-medium text-white/80">{claims?.name ?? "Sin sesión"}</p>
          <p className="text-xs text-white/60">{claims?.role}</p>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center justify-center gap-8 p-8">
        <div className="flex items-center gap-3 text-2xl font-semibold text-emerald-700">
          <CheckCircle2 className="h-8 w-8" aria-hidden />
          Sesión iniciada
        </div>

        <h1 className="text-4xl font-bold text-center">
          Hola{claims?.name ? `, ${claims.name}` : ""}
        </h1>

        <p className="text-lg text-muted-foreground max-w-xl text-center">
          El dashboard de la línea se construye en la próxima etapa, cuando llegue el detalle
          del flujo de producción (piezas, tipos, horno, etc.).
        </p>

        <LogoutButton />
      </section>
    </main>
  );
}
