/**
 * Shell del área autenticada. Header común + slot para cada página.
 */
import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireSession } from "@/lib/auth-guards";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const claims = await requireSession();
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="flex items-center justify-between bg-[#1627b1] px-6 py-3 text-white shadow">
        <Link href="/dashboard" className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="DAO SRL" className="h-10 w-auto" />
          <span className="hidden sm:inline text-lg font-semibold tracking-wide">dao-ops</span>
        </Link>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium">{claims.name}</p>
            <p className="text-xs text-white/70">{rolLabel(claims.role)}</p>
          </div>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function rolLabel(rol: string) {
  if (rol === "ADMIN") return "Administrador";
  if (rol === "SUPERVISOR") return "Supervisor";
  return "Operario";
}
