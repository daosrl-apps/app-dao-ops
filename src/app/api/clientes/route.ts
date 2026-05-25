/**
 * GET /api/clientes?q=...
 * Autocompletado de clientes (visible para supervisor/admin).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSessionApi } from "@/lib/auth-guards";

export async function GET(req: NextRequest) {
  const auth = await requireSessionApi(["SUPERVISOR", "ADMIN"]);
  if ("response" in auth) return auth.response;

  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  const where = q ? { nombre: { contains: q, mode: "insensitive" as const } } : {};

  const clientes = await prisma.cliente.findMany({
    where,
    take: 50,
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true },
  });
  return NextResponse.json({ clientes });
}
