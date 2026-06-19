/**
 * Home del área autenticada. Cada rol ve sus accesos.
 * El operario aterriza directo en su vista de ejecución; supervisor / admin
 * ven un grid de secciones.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ClipboardList,
  PackageSearch,
  Users,
  LineChart,
  Activity,
  Clock,
  Monitor,
  GanttChartSquare,
  History,
} from "lucide-react";
import { requireSession } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

interface Tarjeta {
  href: string;
  titulo: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: ReadonlyArray<"OPERARIO" | "SUPERVISOR" | "ADMIN">;
}

const TARJETAS: Tarjeta[] = [
  {
    href: "/operario",
    titulo: "Trabajo en curso",
    desc: "Pausar, reanudar y finalizar la orden en línea.",
    icon: Activity,
    roles: ["OPERARIO", "SUPERVISOR", "ADMIN"],
  },
  {
    href: "/dashboard/ordenes",
    titulo: "Órdenes de trabajo",
    desc: "Listado de OTs, carga de nuevas y su estado.",
    icon: ClipboardList,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    href: "/dashboard/gantt",
    titulo: "Gantt",
    desc: "Diagrama de OTs en una regla de tiempo (girá el celular).",
    icon: GanttChartSquare,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    href: "/tv",
    titulo: "Pantalla de TV",
    desc: "Vista fullscreen para el televisor sobre la línea.",
    icon: Monitor,
    roles: ["SUPERVISOR", "ADMIN"],
  },
  {
    href: "/dashboard/articulos",
    titulo: "Artículos",
    desc: "Catálogo + importación desde CSV.",
    icon: PackageSearch,
    roles: ["ADMIN"],
  },
  {
    href: "/dashboard/turnos",
    titulo: "Turnos",
    desc: "Configurar horarios de los turnos de la planta.",
    icon: Clock,
    roles: ["ADMIN", "SUPERVISOR"],
  },
  {
    href: "/dashboard/usuarios",
    titulo: "Usuarios",
    desc: "Alta, baja y edición de operarios / supervisores.",
    icon: Users,
    roles: ["ADMIN"],
  },
  {
    href: "/dashboard/metricas",
    titulo: "Métricas",
    desc: "Dashboard y comparativa contra el período anterior.",
    icon: LineChart,
    roles: ["ADMIN"],
  },
  {
    href: "/dashboard/auditoria",
    titulo: "Auditoría",
    desc: "Bitácora de eventos: altas, bajas, modificaciones y más.",
    icon: History,
    roles: ["ADMIN"],
  },
];

export default async function DashboardPage() {
  const claims = await requireSession();

  // Operario va directo a su vista de ejecución.
  if (claims.role === "OPERARIO") redirect("/operario");

  const visibles = TARJETAS.filter((t) => t.roles.includes(claims.role));

  return (
    <section className="mx-auto w-full max-w-6xl p-6">
      <h1 className="text-3xl font-bold text-slate-800 mb-2">Hola {claims.name}</h1>
      <p className="text-slate-600 mb-8">Elegí qué hacer.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {visibles.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="flex items-start gap-4 rounded-2xl bg-white p-5 shadow-sm border border-slate-200 hover:border-[#1627b1] hover:shadow transition"
          >
            <t.icon className="h-10 w-10 text-[#1627b1] shrink-0" aria-hidden />
            <div>
              <h2 className="text-xl font-semibold text-slate-800">{t.titulo}</h2>
              <p className="text-sm text-slate-600 mt-1">{t.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
