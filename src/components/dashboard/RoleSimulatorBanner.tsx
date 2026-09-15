"use client";

import { motion } from "framer-motion";
import { useState } from "react";

import { IconApprovals, IconCheck, IconUser, IconUserCheck } from "@/components/ui/Icons";
import { useToast } from "@/components/ui/Toast";

export type SimulatedRole = "HC_ADMIN" | "MANAGER" | "SECURITY";

interface RoleSimulatorBannerProps {
  onRoleChange?: (role: SimulatedRole) => void;
}

export function RoleSimulatorBanner({ onRoleChange }: RoleSimulatorBannerProps) {
  const { toast } = useToast();
  const [activeRole, setActiveRole] = useState<SimulatedRole>("HC_ADMIN");

  function handleSelectRole(role: SimulatedRole, label: string) {
    setActiveRole(role);
    onRoleChange?.(role);
    toast(`Tampilan beralih ke Peran: ${label}`, "info");
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-accent/40 bg-surface/80 p-3.5 backdrop-blur-md shadow-[0_4px_20px_rgba(253,183,19,0.15)]"
    >
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-xl bg-accent/20 text-accent font-bold text-xs shadow-[0_0_10px_rgba(253,183,19,0.3)]">
          RBAC
        </span>
        <div>
          <p className="text-xs font-bold tracking-wide text-ink uppercase">
            Simulasi Peran Akses (RBAC Switcher)
          </p>
          <p className="text-[11px] text-ink-muted">
            Uji tampilan dasbor berdasarkan wewenang pengguna yang sedang masuk.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 rounded-xl border border-hairline bg-canvas/80 p-1">
        <button
          type="button"
          onClick={() => handleSelectRole("HC_ADMIN", "HC Admin (Penuh)")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeRole === "HC_ADMIN"
              ? "bg-accent text-accent-ink shadow-sm"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          <IconUser className="size-3.5" />
          HC Admin
        </button>
        <button
          type="button"
          onClick={() => handleSelectRole("MANAGER", "Manager Divisi")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeRole === "MANAGER"
              ? "bg-accent text-accent-ink shadow-sm"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          <IconUserCheck className="size-3.5" />
          Manager
        </button>
        <button
          type="button"
          onClick={() => handleSelectRole("SECURITY", "IT Security")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeRole === "SECURITY"
              ? "bg-accent text-accent-ink shadow-sm"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          <IconApprovals className="size-3.5" />
          IT Security
        </button>
      </div>
    </motion.div>
  );
}
