-- =============================================================================
-- Migración: eliminar PCP, introducir OrdenTrabajo y Turno.
--
-- Decisión del usuario (2026-05-27): RESET LIMPIO del dominio de producción.
-- Las tablas Pcp/Item se borran completamente; las OTs nuevas son una tabla
-- distinta sin migración de datos viejos.
--
-- Cambios:
--   - Drop Pausa (estaba ligada a Item).
--   - Drop Item.
--   - Drop Pcp.
--   - Drop enums Jornada y PcpEstado (ItemEstado se reutiliza renombrado a OrdenEstado).
--   - Rename ItemEstado → OrdenEstado.
--   - Add columna superficieM2 a Articulo (m² por pieza).
--   - Create OrdenTrabajo (1 fila = 1 OT con artículo, cantidad, tipo, etc.).
--   - Create Pausa nueva (ligada a OrdenTrabajo).
--   - Create Turno (configuración global; 1..N filas).
-- =============================================================================

-- Drop FK / tablas viejas en orden seguro.
DROP TABLE IF EXISTS "Pausa";
DROP TABLE IF EXISTS "Item";
DROP TABLE IF EXISTS "Pcp";

-- Drop enums obsoletos.
DROP TYPE IF EXISTS "Jornada";
DROP TYPE IF EXISTS "PcpEstado";

-- Renombrar ItemEstado a OrdenEstado y agregar CANCELADO.
-- (Estrategia: drop + create. No hay datos en ningún row que lo use.)
DROP TYPE IF EXISTS "ItemEstado";
CREATE TYPE "OrdenEstado" AS ENUM ('PENDIENTE', 'EN_CURSO', 'FINALIZADO', 'CANCELADO');

-- Articulo: agregar superficieM2.
ALTER TABLE "Articulo" ADD COLUMN "superficieM2" DOUBLE PRECISION;

-- OrdenTrabajo: tabla principal del dominio nuevo.
CREATE TABLE "OrdenTrabajo" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "articuloId" TEXT NOT NULL,
    "tipo" "ItemTipo" NOT NULL,
    "color" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "piezasPorPercha" INTEGER,
    "velocidadLavado" DOUBLE PRECISION,
    "configPerchas" TEXT,
    "estado" "OrdenEstado" NOT NULL DEFAULT 'PENDIENTE',
    "inicioProgramado" TIMESTAMP(3) NOT NULL,
    "inicioTeorico" TIMESTAMP(3) NOT NULL,
    "finTeorico" TIMESTAMP(3) NOT NULL,
    "inicioReal" TIMESTAMP(3),
    "finReal" TIMESTAMP(3),
    "ordenPadreId" TEXT,
    "cantidadCompletada" INTEGER NOT NULL DEFAULT 0,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrdenTrabajo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrdenTrabajo_numero_key" ON "OrdenTrabajo"("numero");
CREATE INDEX "OrdenTrabajo_estado_idx" ON "OrdenTrabajo"("estado");
CREATE INDEX "OrdenTrabajo_inicioProgramado_idx" ON "OrdenTrabajo"("inicioProgramado");
CREATE INDEX "OrdenTrabajo_articuloId_idx" ON "OrdenTrabajo"("articuloId");
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_articuloId_fkey"
  FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_creadoPorId_fkey"
  FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrdenTrabajo" ADD CONSTRAINT "OrdenTrabajo_ordenPadreId_fkey"
  FOREIGN KEY ("ordenPadreId") REFERENCES "OrdenTrabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Pausa: recreada con FK a OrdenTrabajo.
CREATE TABLE "Pausa" (
    "id" TEXT NOT NULL,
    "ordenId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pausa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Pausa_ordenId_idx" ON "Pausa"("ordenId");
ALTER TABLE "Pausa" ADD CONSTRAINT "Pausa_ordenId_fkey"
  FOREIGN KEY ("ordenId") REFERENCES "OrdenTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Turno: configuración de turnos (1..N filas; en la práctica 1 o 2).
CREATE TABLE "Turno" (
    "id" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "horaInicio" INTEGER NOT NULL,
    "minutoInicio" INTEGER NOT NULL DEFAULT 0,
    "duracionMin" INTEGER NOT NULL,
    "habilitado" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turno_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Turno_orden_key" ON "Turno"("orden");

-- Turno por defecto: un solo turno 6:00 a 14:00 (8 horas). El admin puede
-- editarlo desde /dashboard/turnos.
INSERT INTO "Turno" ("id", "orden", "horaInicio", "minutoInicio", "duracionMin", "habilitado", "updatedAt")
VALUES (gen_random_uuid()::text, 1, 6, 0, 480, true, CURRENT_TIMESTAMP);
