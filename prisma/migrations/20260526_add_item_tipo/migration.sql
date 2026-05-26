-- Split lavado/pintura como tipos de Item separados.
-- Items existentes se preservan: por defecto quedan tipo=PINTURA. Los Items
-- con incluyeLavado=true que ya existían se desdoblan acá: el actual queda
-- como PINTURA y se inserta un LAVADO "hermano" con orden -0.5 (lo
-- normalizamos a enteros al final).

-- ---- Enum + columna ---------------------------------------------------------
CREATE TYPE "ItemTipo" AS ENUM ('LAVADO', 'PINTURA');
ALTER TABLE "Item" ADD COLUMN "tipo" "ItemTipo" NOT NULL DEFAULT 'PINTURA';

-- ---- Backfill: por cada Item con incluyeLavado, insertar un LAVADO ----------
-- Usamos orden * 2 para todos, después insertamos los LAVADO con orden
-- "(2*orden_pintura) - 1" para que queden inmediatamente antes en la
-- secuencia (no es lo "ideal" del optimizador — agrupar todos los LAVADO al
-- inicio — pero preserva el orden total previo del PCP sin colisionar uniques).
UPDATE "Item" SET "orden" = "orden" * 2;

INSERT INTO "Item" (
  "id", "pcpId", "articuloId", "tipo", "color", "cantidad",
  "incluyeLavado", "piezasPorPercha", "velocidadLavado", "configPerchas",
  "orden", "estado", "inicioTeorico", "finTeorico",
  "inicioReal", "finReal", "createdAt", "updatedAt"
)
SELECT
  'cl_' || substring(md5(random()::text || clock_timestamp()::text), 1, 22),
  "pcpId",
  "articuloId",
  'LAVADO'::"ItemTipo",
  "color",
  "cantidad",
  false,
  "piezasPorPercha",
  "velocidadLavado",
  "configPerchas",
  "orden" - 1,
  -- Si el item original ya está finalizado/en curso, el lavado se considera
  -- finalizado retroactivamente (la planta ya pasó esa etapa).
  CASE WHEN "estado" = 'PENDIENTE'::"ItemEstado" THEN 'PENDIENTE'::"ItemEstado"
       ELSE 'FINALIZADO'::"ItemEstado" END,
  "inicioTeorico",
  "inicioTeorico",
  "inicioReal",
  "inicioReal",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Item"
WHERE "incluyeLavado" = true AND "tipo" = 'PINTURA';
