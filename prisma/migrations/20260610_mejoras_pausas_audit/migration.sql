-- =============================================================================
-- Migración: mejoras de pausas + observaciones de OT + módulo de auditoría.
--
-- Cambios:
--   - Pausa: agregar "usuarioId" (quién pausó) y "duracionOverrideSeg"
--     (override manual de minutos editado por supervisor/admin al reanudar).
--   - OrdenTrabajo: agregar "observaciones" (justificación de desvío >20% y notas).
--   - Crear tabla Auditoria (bitácora append-only de eventos del sistema).
-- =============================================================================

-- Pausa: usuario que registró la pausa + override de duración.
ALTER TABLE "Pausa" ADD COLUMN "usuarioId" TEXT;
ALTER TABLE "Pausa" ADD COLUMN "duracionOverrideSeg" INTEGER;
CREATE INDEX "Pausa_usuarioId_idx" ON "Pausa"("usuarioId");
ALTER TABLE "Pausa" ADD CONSTRAINT "Pausa_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OrdenTrabajo: observaciones / justificación.
ALTER TABLE "OrdenTrabajo" ADD COLUMN "observaciones" TEXT;

-- Auditoria: bitácora de eventos del dominio.
CREATE TABLE "Auditoria" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT,
    "resumen" TEXT NOT NULL,
    "detalle" JSONB,
    "usuarioId" TEXT,
    "usuarioNombre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Auditoria_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Auditoria_createdAt_idx" ON "Auditoria"("createdAt");
CREATE INDEX "Auditoria_tipo_idx" ON "Auditoria"("tipo");
CREATE INDEX "Auditoria_entidad_idx" ON "Auditoria"("entidad");
ALTER TABLE "Auditoria" ADD CONSTRAINT "Auditoria_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
