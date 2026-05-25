-- =============================================================================
-- Domain de PCP / producción
-- =============================================================================

-- ---- User: pinHash opcional + username/passwordHash para sup/admin ----------
ALTER TABLE "User" ALTER COLUMN "pinHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- ---- Enums ------------------------------------------------------------------
CREATE TYPE "Jornada" AS ENUM ('J_06_14', 'J_14_22', 'J_22_06', 'J_06_18', 'J_18_06');
CREATE TYPE "PcpEstado" AS ENUM ('PENDIENTE', 'EN_CURSO', 'FINALIZADO', 'CANCELADO');
CREATE TYPE "ItemEstado" AS ENUM ('PENDIENTE', 'EN_CURSO', 'FINALIZADO');

-- ---- Cliente ----------------------------------------------------------------
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Cliente_nombre_key" ON "Cliente"("nombre");
CREATE INDEX "Cliente_nombre_idx" ON "Cliente"("nombre");

-- ---- Articulo ---------------------------------------------------------------
CREATE TABLE "Articulo" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "descripcion" TEXT,
    "piezasPorHora" DOUBLE PRECISION NOT NULL,
    "color" TEXT NOT NULL,
    "colorRevisar" BOOLEAN NOT NULL DEFAULT false,
    "configPerchas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Articulo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Articulo_clienteId_codigo_key" ON "Articulo"("clienteId", "codigo");
CREATE INDEX "Articulo_color_idx" ON "Articulo"("color");
CREATE INDEX "Articulo_colorRevisar_idx" ON "Articulo"("colorRevisar");
ALTER TABLE "Articulo" ADD CONSTRAINT "Articulo_clienteId_fkey"
  FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- Pcp --------------------------------------------------------------------
CREATE TABLE "Pcp" (
    "id" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "jornada" "Jornada" NOT NULL,
    "estado" "PcpEstado" NOT NULL DEFAULT 'PENDIENTE',
    "creadoPorId" TEXT NOT NULL,
    "ordenManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pcp_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Pcp_inicio_idx" ON "Pcp"("inicio");
CREATE INDEX "Pcp_estado_idx" ON "Pcp"("estado");
ALTER TABLE "Pcp" ADD CONSTRAINT "Pcp_creadoPorId_fkey"
  FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- Item -------------------------------------------------------------------
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "pcpId" TEXT NOT NULL,
    "articuloId" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL,
    "incluyeLavado" BOOLEAN NOT NULL DEFAULT true,
    "piezasPorPercha" INTEGER,
    "velocidadLavado" DOUBLE PRECISION,
    "configPerchas" TEXT,
    "orden" INTEGER NOT NULL,
    "estado" "ItemEstado" NOT NULL DEFAULT 'PENDIENTE',
    "inicioTeorico" TIMESTAMP(3) NOT NULL,
    "finTeorico" TIMESTAMP(3) NOT NULL,
    "inicioReal" TIMESTAMP(3),
    "finReal" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Item_pcpId_orden_key" ON "Item"("pcpId", "orden");
CREATE INDEX "Item_pcpId_idx" ON "Item"("pcpId");
CREATE INDEX "Item_estado_idx" ON "Item"("estado");
ALTER TABLE "Item" ADD CONSTRAINT "Item_pcpId_fkey"
  FOREIGN KEY ("pcpId") REFERENCES "Pcp"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_articuloId_fkey"
  FOREIGN KEY ("articuloId") REFERENCES "Articulo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---- Pausa ------------------------------------------------------------------
CREATE TABLE "Pausa" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "motivo" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pausa_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Pausa_itemId_idx" ON "Pausa"("itemId");
ALTER TABLE "Pausa" ADD CONSTRAINT "Pausa_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---- ImportacionCsv ---------------------------------------------------------
CREATE TABLE "ImportacionCsv" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "nombreArchivo" TEXT,
    "totalFilas" INTEGER NOT NULL,
    "filasOk" INTEGER NOT NULL,
    "filasError" INTEGER NOT NULL,
    "articulosNuevos" INTEGER NOT NULL DEFAULT 0,
    "articulosActualizados" INTEGER NOT NULL DEFAULT 0,
    "articulosSinColor" INTEGER NOT NULL DEFAULT 0,
    "detalle" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportacionCsv_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ImportacionCsv_createdAt_idx" ON "ImportacionCsv"("createdAt");
ALTER TABLE "ImportacionCsv" ADD CONSTRAINT "ImportacionCsv_usuarioId_fkey"
  FOREIGN KEY ("usuarioId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
