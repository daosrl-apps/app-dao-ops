/**
 * Bitácora de auditoría: registra eventos del dominio (altas, bajas,
 * modificaciones, inicios/finalizaciones de OT, pausas, imports, cambios de
 * turnos y logins) en la tabla `Auditoria`.
 *
 * Diseño:
 *  - `registrarAuditoria` se puede llamar con el cliente global de Prisma o con
 *    un cliente de transacción (`tx`) para que el evento se confirme/revierta
 *    junto con la operación.
 *  - Cuando se usa SIN transacción, los errores al escribir el log se tragan
 *    (la auditoría no debe romper la operación principal). Dentro de una
 *    transacción, en cambio, se propaga para no dejar el log a medias.
 */
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

type DbClient = typeof prisma | Prisma.TransactionClient;

export type TipoAuditoria =
  | "CREAR"
  | "EDITAR"
  | "ELIMINAR"
  | "INICIAR"
  | "FINALIZAR"
  | "PAUSAR"
  | "REANUDAR"
  | "REORDENAR"
  | "SPLIT"
  | "IMPORTAR"
  | "LOGIN";

export type EntidadAuditoria = "OT" | "Pausa" | "Usuario" | "Articulo" | "Turno" | "Auth";

export interface UsuarioAuditoria {
  id?: string | null;
  name?: string | null;
}

export interface RegistroAuditoria {
  tipo: TipoAuditoria;
  entidad: EntidadAuditoria;
  entidadId?: string | null;
  resumen: string;
  detalle?: Prisma.InputJsonValue;
  usuario?: UsuarioAuditoria | null;
}

/**
 * Inserta un evento en la bitácora. Pasá `db = tx` para que participe de una
 * transacción; si no, usa el cliente global y nunca lanza (loguea el error).
 */
export async function registrarAuditoria(
  db: DbClient,
  registro: RegistroAuditoria,
): Promise<void> {
  const data = {
    tipo: registro.tipo,
    entidad: registro.entidad,
    entidadId: registro.entidadId ?? null,
    resumen: registro.resumen,
    detalle: registro.detalle,
    usuarioId: registro.usuario?.id ?? null,
    usuarioNombre: registro.usuario?.name ?? null,
  };

  const esTransaccion = db !== prisma;
  if (esTransaccion) {
    await db.auditoria.create({ data });
    return;
  }
  try {
    await db.auditoria.create({ data });
  } catch (err) {
    console.error("No se pudo registrar auditoría:", err);
  }
}
