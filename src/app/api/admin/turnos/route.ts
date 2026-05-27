/**
 * GET /api/admin/turnos → lee configuración de turnos
 * PUT /api/admin/turnos → reemplaza la configuración
 *
 * Body PUT:
 *   {
 *     turnos: [
 *       { orden: 1, horaInicio: 6, minutoInicio: 0, duracionMin: 480, habilitado: true },
 *       { orden: 2, horaInicio: 14, minutoInicio: 0, duracionMin: 480, habilitado: true }
 *     ]
 *   }
 *
 * En la práctica hay 1 o 2 turnos. La operación es "replace all": borra los
 * existentes y crea los nuevos en una transacción.
 *
 * GET es accesible por todos los roles autenticados (la app necesita conocer
 * los turnos para validar OTs); PUT solo ADMIN.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";

const TurnoInput = z.object({
  orden: z.number().int().min(1).max(10),
  horaInicio: z.number().int().min(0).max(23),
  minutoInicio: z.number().int().min(0).max(59).default(0),
  duracionMin: z.number().int().min(30).max(24 * 60),
  habilitado: z.boolean().default(true),
});

const Body = z.object({
  turnos: z.array(TurnoInput).min(1).max(4),
});

// El máximo de 4 turnos es deliberado: planta con 4 cuadrillas rotando es el
// caso más extremo razonable. Si crece, subir el `max` acá y el guard de UI.

export async function GET() {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  const turnos = await prisma.turno.findMany({ orderBy: { orden: "asc" } });
  return NextResponse.json({ turnos });
}

export async function PUT(req: NextRequest) {
  const auth = await requireSessionApi(["ADMIN"]);
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

  const turnos = await prisma.$transaction(async (tx) => {
    await tx.turno.deleteMany({});
    for (const t of parsed.data.turnos) {
      await tx.turno.create({ data: t });
    }
    return tx.turno.findMany({ orderBy: { orden: "asc" } });
  });

  return NextResponse.json({ ok: true, turnos });
}
