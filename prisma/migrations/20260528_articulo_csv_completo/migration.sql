-- AlterTable: columnas adicionales del CSV completo de artículos
ALTER TABLE "Articulo" ADD COLUMN "perchas" DOUBLE PRECISION;
ALTER TABLE "Articulo" ADD COLUMN "tiempoVueltaMin" DOUBLE PRECISION;
ALTER TABLE "Articulo" ADD COLUMN "piezasPorVuelta" DOUBLE PRECISION;
ALTER TABLE "Articulo" ADD COLUMN "velLineaMtsMin" DOUBLE PRECISION;
