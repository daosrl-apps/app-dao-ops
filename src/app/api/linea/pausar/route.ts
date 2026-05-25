/**
 * POST /api/linea/pausar
 * Body: { motivo: string }
 *
 * Crea una Pausa abierta (`fin` null) sobre el ítem EN_CURSO. Error si ya hay
 * una pausa activa o si no hay ítem corriendo.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";

const Body = z.object({ motivo: z.string().trim().min(1).max(500) });

export async function POST(req: NextRequest) {
  const auth = await requireSessionApi();
  if ("response" in auth) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Hay que indicar un motivo" }, { status: 400 });
  }

  const item = await prisma.item.findFirst({
    where: { estado: "EN_CURSO" },
    include: { pausas: { where: { fin: null } } },
  });
  if (!item) return NextResponse.json({ error: "No hay ítem en curso" }, { status: 400 });
  if (item.pausas.length > 0) {
    return NextResponse.json({ error: "Ya hay una pausa abierta" }, { status: 400 });
  }

  await prisma.pausa.create({
    data: { itemId: item.id, motivo: parsed.data.motivo },
  });
  return NextResponse.json({ ok: true });
}
