/**
 * GET /api/admin/articulos?revisar=true → lista (filtros opcionales)
 * PATCH también desde aquí no — se hace en /api/admin/articulos/[id].
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";

export async function GET(req: NextRequest) {
  const auth = await requireSessionApi(["ADMIN", "SUPERVISOR"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const revisar = searchParams.get("revisar");
  const search = searchParams.get("q")?.trim();
  const clienteId = searchParams.get("clienteId")?.trim();

  const where: Record<string, unknown> = {};
  if (revisar === "true") where.colorRevisar = true;
  if (clienteId) where.clienteId = clienteId;
  if (search) {
    where.OR = [
      { codigo: { contains: search, mode: "insensitive" } },
      { descripcion: { contains: search, mode: "insensitive" } },
    ];
  }

  const articulos = await prisma.articulo.findMany({
    where,
    take: 500,
    orderBy: [{ colorRevisar: "desc" }, { codigo: "asc" }],
    include: { cliente: { select: { id: true, nombre: true } } },
  });

  return NextResponse.json({ articulos });
}
