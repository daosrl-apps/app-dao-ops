import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth-guards";
import { TurnosClient, type TurnoView } from "./turnos-client";

export const dynamic = "force-dynamic";

export default async function TurnosPage() {
  await requireSession(["ADMIN"]);

  const turnos = await prisma.turno.findMany({ orderBy: { orden: "asc" } });
  const items: TurnoView[] = turnos.map((t) => ({
    orden: t.orden,
    horaInicio: t.horaInicio,
    minutoInicio: t.minutoInicio,
    duracionMin: t.duracionMin,
    habilitado: t.habilitado,
  }));

  return (
    <section className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Turnos de trabajo</h1>
      <p className="text-slate-600 mb-6">
        Definí hasta 2 turnos por día. Las OTs deben caber dentro de un turno; si no, el sistema te
        va a ofrecer partirlas.
      </p>
      <TurnosClient initial={items} />
    </section>
  );
}
