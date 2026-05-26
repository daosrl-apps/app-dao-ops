/**
 * GET  /api/pcp        → lista de PCPs (con items)
 * POST /api/pcp        → crear nuevo PCP con items
 *
 * Body de creación:
 *   {
 *     inicio: ISOString (fecha + hora de inicio de la jornada),
 *     jornada: Jornada,
 *     ordenManual: boolean,         // false si el orden viene del optimizador
 *     items: ItemInput[]            // en el orden final que se quiere guardar
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Jornada } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { planificarItems } from "@/lib/pcp-utils";

const JornadaEnum = z.enum(["J_06_14", "J_14_22", "J_22_06", "J_06_18", "J_18_06"]);

const ItemSchema = z.object({
  articuloId: z.string().min(1),
  /// Tipo explícito (preferido). Si no viene, cae al flag legacy `incluyeLavado`.
  tipo: z.enum(["LAVADO", "PINTURA"]).optional(),
  color: z.string().min(1),
  cantidad: z.number().int().positive(),
  /// Legacy: si tipo no vino y este flag es true, se interpreta como LAVADO.
  incluyeLavado: z.boolean().optional(),
  piezasPorPercha: z.number().int().min(1).max(10).nullable().optional(),
  velocidadLavado: z.number().min(0.1).max(3.0).nullable().optional(),
});

const Body = z.object({
  inicio: z.string().datetime(),
  jornada: JornadaEnum,
  ordenManual: z.boolean().default(false),
  items: z.array(ItemSchema).min(1).max(8),
});

export async function GET() {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN", "OPERARIO"]);
  if ("response" in auth) return auth.response;

  const pcps = await prisma.pcp.findMany({
    take: 100,
    orderBy: { inicio: "desc" },
    include: {
      items: {
        orderBy: { orden: "asc" },
        include: { articulo: { include: { cliente: true } } },
      },
      creadoPor: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json({ pcps });
}

export async function POST(req: NextRequest) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { inicio, jornada, ordenManual, items } = parsed.data;

  // Cargamos los artículos referenciados para sacar piezasPorHora + configPerchas.
  const articulos = await prisma.articulo.findMany({
    where: { id: { in: items.map((i) => i.articuloId) } },
    select: { id: true, piezasPorHora: true, configPerchas: true },
  });
  const articuloMap = new Map(articulos.map((a) => [a.id, a]));
  for (const i of items) {
    if (!articuloMap.has(i.articuloId)) {
      return NextResponse.json(
        { error: `Artículo no encontrado: ${i.articuloId}` },
        { status: 400 },
      );
    }
    const esLavado = i.tipo === "LAVADO" || (i.tipo == null && i.incluyeLavado);
    if (esLavado && (i.piezasPorPercha == null || i.velocidadLavado == null)) {
      return NextResponse.json(
        { error: "Items de lavado requieren piezasPorPercha y velocidadLavado" },
        { status: 400 },
      );
    }
  }

  const inicioDate = new Date(inicio);

  // Resolución de tipo por ítem:
  //  - Si viene `tipo` explícito (wizard nuevo): se usa tal cual.
  //  - Si no viene y `incluyeLavado` está, se desdobla en LAVADO + PINTURA
  //    (compatibilidad con clientes viejos).
  //  - Si nada de eso, default = PINTURA.
  type SubItem = {
    articuloId: string;
    tipo: "LAVADO" | "PINTURA";
    color: string;
    cantidad: number;
    piezasPorHora: number;
    configPerchas: string | null;
    piezasPorPercha: number | null;
    velocidadLavado: number | null;
  };
  const subItems: SubItem[] = [];
  for (const it of items) {
    const a = articuloMap.get(it.articuloId)!;
    if (it.tipo) {
      subItems.push({
        articuloId: it.articuloId,
        tipo: it.tipo,
        color: it.color,
        cantidad: it.cantidad,
        piezasPorHora: a.piezasPorHora,
        configPerchas: a.configPerchas,
        piezasPorPercha: it.tipo === "LAVADO" ? (it.piezasPorPercha ?? null) : null,
        velocidadLavado: it.tipo === "LAVADO" ? (it.velocidadLavado ?? null) : null,
      });
      continue;
    }
    // Camino legacy.
    if (it.incluyeLavado) {
      subItems.push({
        articuloId: it.articuloId,
        tipo: "LAVADO",
        color: it.color,
        cantidad: it.cantidad,
        piezasPorHora: a.piezasPorHora,
        configPerchas: a.configPerchas,
        piezasPorPercha: it.piezasPorPercha ?? null,
        velocidadLavado: it.velocidadLavado ?? null,
      });
    }
    subItems.push({
      articuloId: it.articuloId,
      tipo: "PINTURA",
      color: it.color,
      cantidad: it.cantidad,
      piezasPorHora: a.piezasPorHora,
      configPerchas: a.configPerchas,
      piezasPorPercha: null,
      velocidadLavado: null,
    });
  }

  const planInputs = subItems.map((s, idx) => ({
    index: idx,
    tipo: s.tipo,
    cantidad: s.cantidad,
    piezasPorHora: s.piezasPorHora,
    color: s.color,
    configPerchas: s.configPerchas,
    piezasPorPercha: s.piezasPorPercha,
    velocidadLavado: s.velocidadLavado,
  }));
  const schedule = planificarItems(planInputs, inicioDate);

  const pcp = await prisma.pcp.create({
    data: {
      inicio: inicioDate,
      jornada: jornada as Jornada,
      ordenManual,
      creadoPorId: auth.claims.sub,
      items: {
        create: subItems.map((s, idx) => {
          const sch = schedule[idx];
          return {
            articuloId: s.articuloId,
            tipo: s.tipo,
            color: s.color,
            cantidad: s.cantidad,
            // Legacy flag: marcamos true en la mitad PINTURA solo si vino
            // acoplada (para trazabilidad). En el modelo nuevo el dato
            // operativo es el `tipo`.
            incluyeLavado: false,
            piezasPorPercha: s.piezasPorPercha,
            velocidadLavado: s.velocidadLavado,
            configPerchas: s.configPerchas,
            orden: idx,
            inicioTeorico: sch.inicio,
            finTeorico: sch.fin,
          };
        }),
      },
    },
    include: { items: { orderBy: { orden: "asc" } } },
  });

  return NextResponse.json({ pcp }, { status: 201 });
}
