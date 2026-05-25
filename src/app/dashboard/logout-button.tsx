"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const onClick = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };
  return (
    <button
      onClick={onClick}
      className="flex h-12 items-center gap-2 rounded-xl border border-white/30 px-4 text-base font-medium hover:bg-white/10"
      aria-label="Cerrar sesión"
    >
      <LogOut className="h-5 w-5" />
      <span className="hidden sm:inline">Cerrar sesión</span>
    </button>
  );
}
