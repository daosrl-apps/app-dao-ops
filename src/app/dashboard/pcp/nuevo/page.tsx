import { requireSession } from "@/lib/auth-guards";
import { NuevoPcpClient } from "./nuevo-pcp-client";

export const dynamic = "force-dynamic";

export default async function NuevoPcpPage() {
  await requireSession(["SUPERVISOR", "ADMIN"]);
  return <NuevoPcpClient />;
}
