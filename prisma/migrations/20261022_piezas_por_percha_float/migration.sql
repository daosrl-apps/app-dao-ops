-- =============================================================================
-- Migración: permitir valores decimales en piezasPorPercha para piezas grandes
-- que ocupan múltiples perchas de la línea de producción (ej: 0.05 = 1 pz cada 20 perchas).
-- =============================================================================

ALTER TABLE "OrdenTrabajo" ALTER COLUMN "piezasPorPercha" TYPE DOUBLE PRECISION;
