/**
 * GET /api/admin/articulos?revisar=true&clienteId=...&q=... → lista (filtros opcionales)
 * PATCH también desde aquí no — se hace en /api/admin/articulos/[id].
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";
import { deduplicarArticulosConCeros } from "@/lib/articulos-dedup";

export async function GET(req: NextRequest) {
  const auth = await requireSessionApi(["ADMIN", "SUPERVISOR"]);
  if ("response" in auth) return auth.response;

  // Unificar automáticamente artículos duplicados por ceros a la izquierda (ej. "000017" y "17")
  await deduplicarArticulosConCeros(prisma);

  const { searchParams } = new URL(req.url);
  const revisar = searchParams.get("revisar");
  const search = searchParams.get("q")?.trim();
  const clienteId = searchParams.get("clienteId")?.trim();

  const where: Record<string, unknown> = {};
  if (revisar === "true") where.colorRevisar = true;
  if (clienteId) where.clienteId = clienteId;
  if (search) {
    // Si buscan por un código con ceros a la izquierda (ej. "000017"), buscamos también sin ceros
    const searchSinCeros = /^0+\d+$/.test(search) ? search.replace(/^0+(?=\d+$)/, "") : search;
    where.OR = [
      { codigo: { contains: search, mode: "insensitive" } },
      ...(searchSinCeros !== search
        ? [{ codigo: { contains: searchSinCeros, mode: "insensitive" as const } }]
        : []),
      { descripcion: { contains: search, mode: "insensitive" } },
      { cliente: { nombre: { contains: search, mode: "insensitive" } } },
    ];
  }

  const [articulosRaw, clientes] = await Promise.all([
    prisma.articulo.findMany({
      where,
      take: 5000,
      include: { cliente: { select: { id: true, nombre: true } } },
    }),
    prisma.cliente.findMany({
      orderBy: { nombre: "asc" },
      select: { id: true, nombre: true },
    }),
  ]);

  const articulos = articulosRaw.sort((a, b) => {
    if (a.colorRevisar !== b.colorRevisar) return a.colorRevisar ? -1 : 1;
    const cmpCliente = a.cliente.nombre.localeCompare(b.cliente.nombre, "es", {
      sensitivity: "base",
    });
    if (cmpCliente !== 0) return cmpCliente;
    return a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" });
  });

  return NextResponse.json({ articulos, clientes });
}
