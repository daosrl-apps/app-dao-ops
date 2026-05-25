import { requireSession } from "@/lib/auth-guards";
import { OperarioClient } from "./operario-client";

export const dynamic = "force-dynamic";

export default async function OperarioPage() {
  const claims = await requireSession();
  return <OperarioClient userName={claims.name} role={claims.role} />;
}
