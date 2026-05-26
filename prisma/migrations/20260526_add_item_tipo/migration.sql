-- Split lavado/pintura como tipos de Item separados.
-- Versión segura: agrega el enum + columna y nada más. Los items existentes
-- quedan tipo=PINTURA por default. Si querían el lavado de un item viejo,
-- se vuelve a cargar el ítem por la UI con la opción "agregar también lavado".
--
-- (Versión previa intentaba desdoblar automáticamente los items con
-- incluyeLavado=true insertando un LAVADO "hermano". Eso chocaba con el
-- unique (pcpId, orden) en datos reales — descartado por seguridad.)

CREATE TYPE "ItemTipo" AS ENUM ('LAVADO', 'PINTURA');
ALTER TABLE "Item" ADD COLUMN "tipo" "ItemTipo" NOT NULL DEFAULT 'PINTURA';
