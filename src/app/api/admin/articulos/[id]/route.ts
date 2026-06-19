/**
 * PATCH /api/admin/articulos/[id]
 *   Permite corregir los parámetros del artículo: color (catálogo cerrado),
 *   descripción, superficie (m²), perchas, tiempo x vuelta, piezas x vuelta,
 *   velocidad de línea, piezasPorHora y configPerchas.
 *   NO se puede editar el cliente ni el código (identifican el artículo).
 *   Al setear color manualmente, `colorRevisar` se pone en false (es una
 *   corrección final, no se vuelve a tocar en próximas importaciones).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { CATALOGO_COLORES, SIN_COLOR } from "@/lib/color-parser";
import { registrarAuditoria } from "@/lib/auditoria";

const VALID_COLORS = new Set<string>([...CATALOGO_COLORES, SIN_COLOR]);

const Body = z.object({
  color: z.string().optional(),
  descripcion: z.string().nullable().optional(),
  superficieM2: z.number().positive().nullable().optional(),
  perchas: z.number().positive().nullable().optional(),
  tiempoVueltaMin: z.number().positive().nullable().optional(),
  piezasPorVuelta: z.number().positive().nullable().optional(),
  velLineaMtsMin: z.number().positive().nullable().optional(),
  piezasPorHora: z.number().positive().optional(),
  configPerchas: z.string().nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireSessionApi(["ADMIN"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.color !== undefined) {
    if (!VALID_COLORS.has(parsed.data.color)) {
      return NextResponse.json(
        { error: `Color "${parsed.data.color}" no está en el catálogo` },
        { status: 400 },
      );
    }
    data.color = parsed.data.color;
    data.colorRevisar = parsed.data.color === SIN_COLOR;
  }
  if (parsed.data.descripcion !== undefined) data.descripcion = parsed.data.descripcion;
  if (parsed.data.superficieM2 !== undefined) data.superficieM2 = parsed.data.superficieM2;
  if (parsed.data.perchas !== undefined) data.perchas = parsed.data.perchas;
  if (parsed.data.tiempoVueltaMin !== undefined) data.tiempoVueltaMin = parsed.data.tiempoVueltaMin;
  if (parsed.data.piezasPorVuelta !== undefined) data.piezasPorVuelta = parsed.data.piezasPorVuelta;
  if (parsed.data.velLineaMtsMin !== undefined) data.velLineaMtsMin = parsed.data.velLineaMtsMin;
  if (parsed.data.piezasPorHora !== undefined) data.piezasPorHora = parsed.data.piezasPorHora;
  if (parsed.data.configPerchas !== undefined) data.configPerchas = parsed.data.configPerchas;

  const articulo = await prisma.articulo.update({ where: { id }, data });

  await registrarAuditoria(prisma, {
    tipo: "EDITAR",
    entidad: "Articulo",
    entidadId: articulo.id,
    resumen: `Editó el artículo ${articulo.codigo}`,
    detalle: { campos: Object.keys(data) },
    usuario: { id: auth.claims.sub, name: auth.claims.name },
  });

  return NextResponse.json({ articulo });
}
