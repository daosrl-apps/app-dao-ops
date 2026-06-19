/**
 * GET /api/tv/gantt
 *
 * Variante pública (TV, sin PIN) de la línea para el Gantt de televisor.
 * Devuelve las OTs EN_CURSO y PENDIENTE con su ventana de tiempo ya resuelta
 * para dibujar:
 *  - EN_CURSO: arranca en su inicio real y termina en inicioReal + duración
 *    teórica + pausas (refleja el atraso real; el bloque cruza la hora actual).
 *  - PENDIENTE: usa inicio/fin teóricos (que se re-encadenan solos al finalizar
 *    cada OT, así el Gantt sigue el plan real).
 *
 * El cliente posiciona los bloques con la hora actual en el borde izquierdo y
 * los va corriendo hacia la izquierda a medida que pasa el tiempo.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const ahora = new Date();

  const rows = await prisma.ordenTrabajo.findMany({
    where: { estado: { in: ["PENDIENTE", "EN_CURSO"] } },
    orderBy: { inicioTeorico: "asc" },
    take: 100,
    include: {
      articulo: { select: { codigo: true, descripcion: true, cliente: { select: { nombre: true } } } },
      pausas: { select: { inicio: true, fin: true, duracionOverrideSeg: true } },
    },
  });

  const ordenes = rows.map((o) => {
    const duracionTeoricaSeg = Math.round(
      (o.finTeorico.getTime() - o.inicioTeorico.getTime()) / 1000,
    );

    let inicioMs: number;
    let finMs: number;
    if (o.estado === "EN_CURSO" && o.inicioReal) {
      // Pausas acumuladas (override si existe; la pausa abierta cuenta hasta ahora).
      const pausasMs = o.pausas.reduce((acc, p) => {
        if (p.duracionOverrideSeg != null) return acc + p.duracionOverrideSeg * 1000;
        if (p.fin) return acc + (p.fin.getTime() - p.inicio.getTime());
        return acc + (ahora.getTime() - p.inicio.getTime());
      }, 0);
      inicioMs = o.inicioReal.getTime();
      finMs = inicioMs + duracionTeoricaSeg * 1000 + pausasMs;
    } else {
      inicioMs = o.inicioTeorico.getTime();
      finMs = o.finTeorico.getTime();
    }

    return {
      id: o.id,
      numero: o.numero,
      tipo: o.tipo as "LAVADO" | "PINTURA",
      color: o.color,
      estado: o.estado,
      cantidad: o.cantidad,
      clienteNombre: o.articulo.cliente.nombre,
      articulo: o.articulo.descripcion?.trim() || o.articulo.codigo,
      inicio: new Date(inicioMs).toISOString(),
      fin: new Date(finMs).toISOString(),
    };
  });

  return NextResponse.json({ serverNow: ahora.toISOString(), ordenes });
}
