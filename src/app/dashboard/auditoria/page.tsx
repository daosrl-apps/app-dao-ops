import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";
import { AuditoriaClient, type AuditoriaView } from "./auditoria-client";

export const dynamic = "force-dynamic";

export default async function AuditoriaPage() {
  await requireSession(["ADMIN"]);

  const eventos = await prisma.auditoria.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
  });

  const items: AuditoriaView[] = eventos.map((e) => ({
    id: e.id,
    tipo: e.tipo,
    entidad: e.entidad,
    resumen: e.resumen,
    usuario: e.usuarioNombre,
    createdAt: e.createdAt.toISOString(),
  }));

  return (
    <section className="mx-auto w-full max-w-6xl p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Auditoría</h1>
      <p className="text-slate-600 mb-6">
        Bitácora de eventos del sistema: altas, bajas, modificaciones, OTs, pausas e inicios de sesión.
      </p>
      <AuditoriaClient items={items} />
    </section>
  );
}
