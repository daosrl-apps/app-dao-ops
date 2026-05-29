import { requireSession } from "@/lib/auth-guards";
import { obtenerConfiguracionPlanta, obtenerTurnosTodos } from "@/lib/turnos";
import { TurnosClient, type TurnoView } from "./turnos-client";

export const dynamic = "force-dynamic";

export default async function TurnosPage() {
  await requireSession(["ADMIN"]);

  const turnos = await obtenerTurnosTodos();
  const cfg = await obtenerConfiguracionPlanta();
  const items: TurnoView[] = turnos.map((t) => ({
    orden: t.orden,
    nombre: t.nombre,
    horaInicio: t.horaInicio,
    minutoInicio: t.minutoInicio,
    duracionMin: t.duracionMin,
    habilitado: t.habilitado,
  }));

  return (
    <section className="mx-auto w-full max-w-2xl p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Turnos de trabajo</h1>
      <p className="text-slate-600 mb-6">
        Configurá los turnos de la planta. El inicio del primer turno habilitado es la apertura de
        fábrica y el fin del último, el cierre. Las OTs deben caber dentro de la jornada; si no, el
        sistema te va a ofrecer partirlas.
      </p>
      <TurnosClient initial={items} extenderActivo={cfg.extenderActivo} />
    </section>
  );
}
