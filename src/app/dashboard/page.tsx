import { getCurrentSessionClaims } from "@/lib/auth";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const claims = await getCurrentSessionClaims();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-4xl font-bold">Bienvenido{claims?.name ? `, ${claims.name}` : ""}</h1>
      <p className="text-lg text-muted-foreground max-w-xl text-center">
        Sesión iniciada. El dashboard de la línea se va a construir cuando llegue el prompt
        detallado del flujo de trabajo (piezas, tipos, horno, etc.).
      </p>
      <p className="text-sm text-muted-foreground">
        Rol: <span className="font-mono font-medium">{claims?.role}</span>
      </p>
      <LogoutButton />
    </main>
  );
}
