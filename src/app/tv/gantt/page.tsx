import { TvGanttClient } from "./tv-gantt-client";

// Vista de Gantt para el televisor (hora actual a la izquierda, OTs corriendo).
export const dynamic = "force-dynamic";

export default function TvGanttPage() {
  return <TvGanttClient />;
}
