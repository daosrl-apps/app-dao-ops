import { TvClient } from "./tv-client";

// La pantalla de TV es pública dentro de la red interna (no requiere PIN).
// Si en el futuro hace falta auth, se agrega un token corto en la URL.
export const dynamic = "force-dynamic";

export default function TvPage() {
  return <TvClient />;
}
