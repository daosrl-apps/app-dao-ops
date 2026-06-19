/**
 * GET /api/admin/turnos → lee configuración de turnos + estado de extensión
 * PUT /api/admin/turnos → reemplaza la configuración
 *
 * Body PUT:
 *   {
 *     turnos: [
 *       { orden: 1, nombre: "Mañana", horaInicio: 6, minutoInicio: 0, duracionMin: 480, habilitado: true },
 *       ...
 *     ]
 *   }
 *
 * La operación es "replace all": borra los existentes y crea los nuevos en una
 * transacción. Se valida que los turnos habilitados no se solapen y que la suma
 * de duraciones no exceda 24 h.
 *
 * GET es accesible por todos los roles autenticados (la app necesita conocer
 * los turnos para validar OTs); PUT lo pueden hacer ADMIN y SUPERVISOR.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { obtenerConfiguracionPlanta, validarTurnos } from "@/lib/turnos";
import { registrarAuditoria } from "@/lib/auditoria";

const TurnoInput = z.object({
  orden: z.number().int().min(1).max(10),
  nombre: z.string().min(1).max(40).default("Turno"),
  horaInicio: z.number().int().min(0).max(23),
  minutoInicio: z.number().int().min(0).max(59).default(0),
  duracionMin: z.number().int().min(30).max(24 * 60),
  habilitado: z.boolean().default(true),
});

const Body = z.object({
  turnos: z.array(TurnoInput).min(1).max(4),
});

export async function GET() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  // Lectura a través de la lib para aplicar el revert perezoso de la extensión.
  const cfg = await obtenerConfiguracionPlanta();
  const turnos = await prisma.turno.findMany({ orderBy: { orden: "asc" } });
  return NextResponse.json({ turnos, configuracion: cfg });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSessionApi(["ADMIN", "SUPERVISOR"]);
  if ("response" in auth) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Validar que no haya `orden` duplicado.
  const ordenes = parsed.data.turnos.map((t) => t.orden);
  if (new Set(ordenes).size !== ordenes.length) {
    return NextResponse.json({ error: "Hay turnos con el mismo número de orden" }, { status: 400 });
  }

  // Validar solape y total ≤ 24 h.
  const errorValidacion = validarTurnos(parsed.data.turnos);
  if (errorValidacion) {
    return NextResponse.json({ error: errorValidacion }, { status: 400 });
  }

  const turnos = await prisma.$transaction(async (tx) => {
    await tx.turno.deleteMany({});
    for (const t of parsed.data.turnos) {
      await tx.turno.create({ data: t });
    }
    await registrarAuditoria(tx, {
      tipo: "EDITAR",
      entidad: "Turno",
      resumen: `Actualizó la configuración de turnos (${parsed.data.turnos.length})`,
      detalle: { turnos: parsed.data.turnos },
      usuario: { id: auth.claims.sub, name: auth.claims.name },
    });
    return tx.turno.findMany({ orderBy: { orden: "asc" } });
  });

  return NextResponse.json({ ok: true, turnos });
}
