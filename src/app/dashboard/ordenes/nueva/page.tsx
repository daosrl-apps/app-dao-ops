import { requireSession } from "@/lib/auth-guards";
import { NuevaOrdenClient } from "./nueva-orden-client";

export const dynamic = "force-dynamic";

export default async function NuevaOrdenPage() {
  await requireSession(["SUPERVISOR", "ADMIN"]);
  return <NuevaOrdenClient />;
}
