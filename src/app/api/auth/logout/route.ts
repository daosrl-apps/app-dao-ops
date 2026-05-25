import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentSessionClaims, SESSION_COOKIE } from "@/lib/auth";

export async function POST(_req: NextRequest) {
  const claims = await getCurrentSessionClaims();
  if (claims) {
    // Borramos la sesión de DB para que un JWT robado deje de servir.
    await prisma.session.deleteMany({ where: { id: claims.sid } }).catch(() => undefined);
    await prisma.authEvent.create({
      data: { userId: claims.sub, action: "logout" },
    });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
