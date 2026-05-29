/**
 * POST   /api/admin/turnos/extender → activa el modo extendido
 *   Body: { soloUnaVez: boolean }
 *   Reconfigura los turnos a Mañana 06:00–12:00 / Tarde 12:00–00:00 y
 *   deshabilita Noche. Si `soloUnaVez` es true, al cambiar el día calendario
 *   se restaura la configuración previa automáticamente.
 *
 * DELETE /api/admin/turnos/extender → revierte el modo extendido a mano,
 *   restaurando la configuración previa.
 *
 * Solo ADMIN.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSessionApi } from "@/lib/auth-guards";
import { aplicarExtension, revertirExtension } from "@/lib/turnos";

const Body = z.object({
  soloUnaVez: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  const auth = await requireSessionApi(["ADMIN"]);
  if ("response" in auth) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await aplicarExtension(parsed.data.soloUnaVez);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const auth = await requireSessionApi(["ADMIN"]);
  if ("response" in auth) return auth.response;

  await revertirExtension();
  return NextResponse.json({ ok: true });
}
