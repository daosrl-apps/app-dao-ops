import { requireSession } from "@/lib/auth-guards";
import { UsuariosClient } from "./usuarios-client";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  await requireSession(["ADMIN"]);
  return <UsuariosClient />;
}
