import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFecha(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function formatFechaHora(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const hora = dt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  return `${formatFecha(dt)} ${hora}`;
}
