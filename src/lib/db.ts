/**
 * Singleton de PrismaClient. En dev Next hace HMR y cada reload re-evalúa
 * los módulos del server — sin el cache global terminaríamos con N conexiones
 * abiertas y el pool de Postgres llorando.
 */
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
