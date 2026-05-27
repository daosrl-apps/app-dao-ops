import { requireSession } from "@/lib/auth-guards";
import { calcularMetricas } from "@/lib/metricas";
import { MetricasClient } from "./metricas-client";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}

export default async function MetricasPage({ searchParams }: PageProps) {
  await requireSession(["ADMIN"]);
  const { desde, hasta } = await searchParams;

  // Default = últimos 7 días. Si vienen `desde`/`hasta` por query, los usamos.
  const fin = hasta ? new Date(hasta + "T23:59:59") : new Date();
  const inicio = desde ? new Date(desde + "T00:00:00") : addDays(fin, -7);

  const data = await calcularMetricas({ inicio, fin });

  return (
    <MetricasClient
      data={data}
      rangoInicial={{ desde: toYMD(inicio), hasta: toYMD(fin) }}
    />
  );
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function pad(n: number) {
  return n.toString().padStart(2, "0");
}
