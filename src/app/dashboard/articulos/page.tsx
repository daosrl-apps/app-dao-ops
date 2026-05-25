import { requireSession } from "@/lib/auth-guards";
import { ArticulosClient } from "./articulos-client";

export const dynamic = "force-dynamic";

export default async function ArticulosPage() {
  await requireSession(["ADMIN"]);
  return <ArticulosClient />;
}
