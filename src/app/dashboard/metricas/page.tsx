import { requireSession } from "@/lib/auth-guards";
import { calcularMetricas } from "@/lib/metricas";
import { MetricasClient } from "./metricas-client";

export const dynamic = "force-dynamic";

export default async function MetricasPage() {
  await requireSession(["ADMIN"]);
  const data = await calcularMetricas();
  return <MetricasClient data={data} />;
}
