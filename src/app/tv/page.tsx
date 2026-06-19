import Link from "next/link";
import { ClipboardList, GanttChartSquare } from "lucide-react";

// La pantalla de TV es pública dentro de la red interna (no requiere PIN).
// Esta es la portada: elige entre la vista de Órdenes y la de Gantt.
export const dynamic = "force-dynamic";

export default function TvPage() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center gap-10 p-8">
      <h1 className="text-5xl md:text-6xl font-black tracking-tight">Pantalla de línea</h1>
      <p className="text-2xl text-slate-400">Elegí qué mostrar en el televisor</p>
      <div className="flex flex-col md:flex-row gap-8 w-full max-w-4xl">
        <Link
          href="/tv/ordenes"
          className="flex-1 h-64 rounded-3xl bg-emerald-600 hover:bg-emerald-700 shadow-2xl flex flex-col items-center justify-center gap-5 active:scale-95 transition"
        >
          <ClipboardList className="h-24 w-24" />
          <span className="text-4xl md:text-5xl font-black">Órdenes</span>
        </Link>
        <Link
          href="/tv/gantt"
          className="flex-1 h-64 rounded-3xl bg-[#1627b1] hover:bg-[#1e30d4] shadow-2xl flex flex-col items-center justify-center gap-5 active:scale-95 transition"
        >
          <GanttChartSquare className="h-24 w-24" />
          <span className="text-4xl md:text-5xl font-black">Gantt</span>
        </Link>
      </div>
    </div>
  );
}
