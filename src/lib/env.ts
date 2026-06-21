/**
 * Validación de las variables de entorno con Zod. Se valida una sola vez al
 * arrancar el módulo y se cachea. Cualquier import de `env` ve los valores
 * tipados.
 *
 * En `build` Next compila los Server Components / Route Handlers — si alguno
 * importa env y faltan vars, el build rompe. Por eso el Dockerfile setea
 * placeholders durante `next build` (ver docker/Dockerfile).
 */
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  AUTH_SECRET: z
    .string()
    .min(32, "AUTH_SECRET debe tener al menos 32 caracteres (usar `openssl rand -base64 32`)"),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(43200),
  // Token de acceso a las pantallas de TV (`/tv`, `/api/tv/*`). Opcional para
  // que el build no rompa, pero si falta el middleware deniega el acceso a TV
  // (fail-closed). Generar con `openssl rand -hex 24`.
  TV_TOKEN: z.string().min(16).optional(),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Variables de entorno inválidas:", parsed.error.flatten().fieldErrors);
  throw new Error("Variables de entorno inválidas — revisar .env contra .env.example");
}

export const env = parsed.data;
export type Env = typeof env;
