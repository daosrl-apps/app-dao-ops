"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { EditarOTModal, type OrdenEditable } from "../editar-ot-modal";

/**
 * Botón ✏️ del detalle de una OT que abre el modal de edición (dividir /
 * corregir cantidad). Solo se renderiza para SUPERVISOR/ADMIN sobre OTs
 * PENDIENTE o EN_CURSO (lo decide el server component que lo monta).
 */
export function EditarOTButton({ orden }: { orden: OrdenEditable }) {
  const router = useRouter();
  const [abierto, setAbierto] = React.useState(false);

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-2 rounded-xl border-2 border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
      >
        <Pencil className="h-4 w-4" />
        Editar
      </button>
      {abierto && (
        <EditarOTModal
          orden={orden}
          onClose={() => setAbierto(false)}
          onDone={() => {
            setAbierto(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
