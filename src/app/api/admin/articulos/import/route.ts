/**
 * POST /api/admin/articulos/import
 *
 * Recibe un JSON `{ csv: string, confirm?: boolean, nombreArchivo?: string }`.
 *  - `confirm=false` (default) → solo devuelve el preview.
 *  - `confirm=true` → upsertea clientes/artículos y registra ImportacionCsv.
 *
 * Upsert key: (cliente.nombre, articulo.codigo).
 *
 * Política de overwrite del color al re-importar:
 *  - Si el artículo existía y su `colorRevisar` era `false` (es decir, ya tenía
 *    color válido, ya sea del parser previo o corregido a mano por el admin),
 *    el color se conserva. Esto preserva las correcciones manuales.
 *  - Si `colorRevisar` era `true` o el artículo es nuevo, se aplica el color
 *    que devolvió el parser en esta importación.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { procesarCsvArticulos } from "@/lib/csv-articulos";

const Body = z.object({
  csv: z.string().min(1).max(20_000_000),
  confirm: z.boolean().optional(),
  nombreArchivo: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireSessionApi(["ADMIN"]);
  if ("response" in auth) return auth.response;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const { csv, confirm, nombreArchivo } = parsed.data;

  const proceso = procesarCsvArticulos(csv);

  if (!confirm) {
    // Preview: devolvemos resumen + primeras 50 filas.
    return NextResponse.json({
      preview: true,
      totalFilas: proceso.totalFilas,
      filasOk: proceso.filasOk,
      filasError: proceso.filasError,
      articulosSinColor: proceso.articulosSinColor,
      muestra: proceso.filas.slice(0, 50),
      errores: proceso.errores.slice(0, 50),
    });
  }

  // Confirm: aplicar upsert. Cacheamos cliente.nombre → id para no consultar
  // por cada fila.
  const clienteCache = new Map<string, string>();
  let articulosNuevos = 0;
  let articulosActualizados = 0;

  for (const f of proceso.filas) {
    let clienteId = clienteCache.get(f.cliente);
    if (!clienteId) {
      const c = await prisma.cliente.upsert({
        where: { nombre: f.cliente },
        update: {},
        create: { nombre: f.cliente },
        select: { id: true },
      });
      clienteId = c.id;
      clienteCache.set(f.cliente, clienteId);
    }

    const existente = await prisma.articulo.findUnique({
      where: { clienteId_codigo: { clienteId, codigo: f.codigo } },
      select: { id: true, colorRevisar: true },
    });

    if (existente) {
      const conservarColor = !existente.colorRevisar;
      await prisma.articulo.update({
        where: { id: existente.id },
        data: {
          descripcion: f.descripcion,
          superficieM2: f.superficieM2,
          piezasPorHora: f.piezasPorHora,
          ...(conservarColor ? {} : { color: f.color, colorRevisar: f.colorRevisar }),
        },
      });
      articulosActualizados++;
    } else {
      await prisma.articulo.create({
        data: {
          clienteId,
          codigo: f.codigo,
          descripcion: f.descripcion,
          superficieM2: f.superficieM2,
          piezasPorHora: f.piezasPorHora,
          color: f.color,
          colorRevisar: f.colorRevisar,
        },
      });
      articulosNuevos++;
    }
  }

  await prisma.importacionCsv.create({
    data: {
      usuarioId: auth.claims.sub,
      nombreArchivo: nombreArchivo ?? null,
      totalFilas: proceso.totalFilas,
      filasOk: proceso.filasOk,
      filasError: proceso.filasError,
      articulosNuevos,
      articulosActualizados,
      articulosSinColor: proceso.articulosSinColor,
      detalle:
        proceso.errores.length > 0
          ? // Prisma Json no acepta directamente arrays tipados; lo casteamos.
            ({ errores: proceso.errores.slice(0, 200) } as unknown as object)
          : undefined,
    },
  });

  return NextResponse.json({
    ok: true,
    totalFilas: proceso.totalFilas,
    filasOk: proceso.filasOk,
    filasError: proceso.filasError,
    articulosNuevos,
    articulosActualizados,
    articulosSinColor: proceso.articulosSinColor,
  });
}
