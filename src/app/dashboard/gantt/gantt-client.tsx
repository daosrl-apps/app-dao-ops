"use client";

import * as React from "react";
import Link from "next/link";
import { Droplets, Paintbrush, Smartphone } from "lucide-react";

export interface GanttOT {
  id: string;
  numero: number;
  estado: "PENDIENTE" | "EN_CURSO" | "FINALIZADO" | "CANCELADO";
  tipo: "LAVADO" | "PINTURA";
  color: string;
  titulo: string;
  inicio: string; // ISO
  fin: string; // ISO
}

const PX_POR_HORA = 64;
const ROW_H = 48;
const LABEL_W = 160;

export function GanttClient({ items }: { items: GanttOT[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-6 text-slate-500">
        No hay órdenes para mostrar.
      </div>
    );
  }

  // Rango temporal: desde la hora en punto previa al primer inicio hasta la
  // hora en punto posterior al último fin.
  const inicios = items.map((o) => new Date(o.inicio).getTime());
  const fines = items.map((o) => new Date(o.fin).getTime());
  const min = piso(new Date(Math.min(...inicios)));
  const max = techo(new Date(Math.max(...fines)));
  const totalHoras = Math.max(1, Math.round((max.getTime() - min.getTime()) / 3_600_000));
  const trackW = totalHoras * PX_POR_HORA;

  const ticks = Array.from({ length: totalHoras + 1 }, (_, i) => {
    const d = new Date(min.getTime() + i * 3_600_000);
    return { x: i * PX_POR_HORA, d };
  });

  const xDe = (iso: string) =>
    ((new Date(iso).getTime() - min.getTime()) / 3_600_000) * PX_POR_HORA;

  return (
    <>
      <p className="mb-3 flex items-center gap-2 text-sm text-slate-500 sm:hidden">
        <Smartphone className="h-4 w-4" /> Girá el celular para ver el diagrama completo.
      </p>

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm border border-slate-200">
        <div style={{ width: LABEL_W + trackW, minWidth: "100%" }}>
          {/* Regla de tiempo */}
          <div className="flex border-b border-slate-200 bg-slate-50">
            <div
              className="sticky left-0 z-20 bg-slate-50 border-r border-slate-200 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500"
              style={{ width: LABEL_W, minWidth: LABEL_W }}
            >
              OT
            </div>
            <div className="relative" style={{ width: trackW, height: 32 }}>
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className="absolute top-0 h-full border-l border-slate-200"
                  style={{ left: t.x }}
                >
                  <span className="absolute left-1 top-1 text-[11px] font-medium text-slate-500 whitespace-nowrap">
                    {formatTick(t.d, i === 0)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Filas de OTs */}
          {items.map((o, idx) => {
            const left = xDe(o.inicio);
            const width = Math.max(6, xDe(o.fin) - left);
            const lavado = o.tipo === "LAVADO";
            return (
              <div
                key={o.id}
                className={"flex items-center " + (idx % 2 ? "bg-white" : "bg-slate-50/40")}
                style={{ height: ROW_H }}
              >
                <Link
                  href={`/dashboard/ordenes/${o.id}`}
                  className="sticky left-0 z-10 flex items-center gap-1 border-r border-slate-200 bg-inherit px-3 text-sm font-bold text-slate-800 hover:text-[#1627b1]"
                  style={{ width: LABEL_W, minWidth: LABEL_W, height: ROW_H }}
                  title={o.titulo}
                >
                  {lavado ? (
                    <Droplets className="h-4 w-4 shrink-0 text-sky-600" />
                  ) : (
                    <Paintbrush className="h-4 w-4 shrink-0 text-violet-600" />
                  )}
                  <span className="truncate">
                    #{o.numero} {o.titulo}
                  </span>
                </Link>
                <div className="relative" style={{ width: trackW, height: ROW_H }}>
                  {/* gridlines */}
                  {ticks.map((t, i) => (
                    <div
                      key={i}
                      className="absolute top-0 h-full border-l border-slate-100"
                      style={{ left: t.x }}
                    />
                  ))}
                  <div
                    className={
                      "absolute top-1/2 -translate-y-1/2 flex items-center rounded-md px-2 text-xs font-bold text-white shadow-sm " +
                      barraColor(o)
                    }
                    style={{ left, width, height: 26 }}
                    title={`${rango(o.inicio, o.fin)}`}
                  >
                    <span className="truncate">
                      {o.tipo === "PINTURA" ? o.color : "Lavado"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
        <Leyenda className="bg-violet-500" label="Pintura" />
        <Leyenda className="bg-sky-500" label="Lavado" />
        <Leyenda className="bg-emerald-500" label="Finalizado" />
        <Leyenda className="bg-blue-500" label="En curso" />
      </div>
    </>
  );
}

function Leyenda({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={"inline-block h-3 w-3 rounded-sm " + className} />
      {label}
    </span>
  );
}

function barraColor(o: GanttOT): string {
  if (o.estado === "FINALIZADO") return "bg-emerald-500";
  if (o.estado === "EN_CURSO") return "bg-blue-500";
  return o.tipo === "LAVADO" ? "bg-sky-500" : "bg-violet-500";
}

function piso(d: Date): Date {
  const x = new Date(d);
  x.setMinutes(0, 0, 0);
  return x;
}
function techo(d: Date): Date {
  const x = new Date(d);
  if (x.getMinutes() !== 0 || x.getSeconds() !== 0 || x.getMilliseconds() !== 0) {
    x.setHours(x.getHours() + 1, 0, 0, 0);
  }
  return x;
}
function formatTick(d: Date, conFecha: boolean): string {
  const hora = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  if (conFecha || d.getHours() === 0) {
    return `${d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} ${hora}`;
  }
  return hora;
}
function rango(inicioISO: string, finISO: string): string {
  const f = (iso: string) =>
    new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
  return `${f(inicioISO)} → ${f(finISO)}`;
}
