import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // DATABASE_URL dummy: algunos módulos (turnos, métricas) importan
    // `@/lib/db`, que construye un PrismaClient al cargar. No se ejecuta ninguna
    // query en los tests (solo se prueban funciones puras), pero el cliente
    // necesita una URL presente para construirse sin quejarse.
    env: {
      DATABASE_URL: "postgresql://placeholder:placeholder@localhost:5432/placeholder",
    },
  },
  resolve: {
    // Espejo del alias `@/*` -> `src/*` del tsconfig.
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
