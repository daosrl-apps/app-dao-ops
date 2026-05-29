-- AlterTable: nombre visible del turno (Mañana / Tarde / Noche)
ALTER TABLE "Turno" ADD COLUMN "nombre" TEXT NOT NULL DEFAULT 'Turno';

-- CreateTable: configuración global de la planta (singleton) — estado de "Extender turno"
CREATE TABLE "ConfiguracionPlanta" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "extenderActivo" BOOLEAN NOT NULL DEFAULT false,
    "extenderSoloUnaVez" BOOLEAN NOT NULL DEFAULT false,
    "extenderFecha" TIMESTAMP(3),
    "configPrevia" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfiguracionPlanta_pkey" PRIMARY KEY ("id")
);
