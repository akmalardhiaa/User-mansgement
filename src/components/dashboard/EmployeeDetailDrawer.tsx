"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import {
  IconAlert,
  IconBriefcase,
  IconBuilding,
  IconCheck,
  IconClock,
  IconClose,
  IconDownload,
  IconExternal,
  IconMail,
  IconPower,
  IconSwap,
  IconUser,
  IconUserCheck,
} from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { TRANSITION_FAST } from "@/lib/motion";
import type { Employee, ApprovalReference } from "@/lib/types";

interface EmployeeDetailDrawerProps {
  employee: Employee | null;
  activeTicket?: ApprovalReference;
  onClose: () => void;
  onToggleAccess: (employee: Employee) => void;
  onOpenTransfer: (employee: Employee) => void;
  onOpenReportPDF?: (employee: Employee) => void;
  busy?: boolean;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function EmployeeDetailDrawer({
  employee,
  activeTicket,
  onClose,
  onToggleAccess,
  onOpenTransfer,
  onOpenReportPDF,
  busy = false,
}: EmployeeDetailDrawerProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "timeline" | "credentials">("overview");
  const [copiedLink, setCopiedLink] = useState(false);
  const [generatedPass, setGeneratedPass] = useState<string | null>(null);

  if (!employee) return null;

  function generateTempPassword() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$";
    let pass = "HC-";
    for (let i = 0; i < 8; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setGeneratedPass(pass);
    toast("Kredensial sementara berhasil dibuat!", "success");
  }

  function copyActivationLink() {
    if (!employee) return;
    const link = `https://hc.mandirisekuritas.co.id/activate?token=act_${employee.id}_${Date.now()}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    toast("Link aktivasi disalin ke clipboard!", "info");
    setTimeout(() => setCopiedLink(false), 3000);
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 overflow-hidden">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={TRANSITION_FAST}
          onClick={onClose}
          className="absolute inset-0 bg-canvas/70 backdrop-blur-sm"
        />

        <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="relative w-screen max-w-md border-l border-hairline-strong/80 bg-surface p-6 shadow-2xl overflow-y-auto flex flex-col justify-between"
          >
            <div>
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-4 border-b border-hairline pb-5">
                <div className="flex items-center gap-3.5">
                  <div className="grid size-12 shrink-0 place-items-center rounded-2xl border border-accent/40 bg-accent/15 text-base font-bold text-accent shadow-[0_0_15px_rgba(253,183,19,0.2)]">
                    {initials(employee.displayName)}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold tracking-tight text-ink">
                      {employee.displayName}
                    </h2>
                    <p className="text-xs text-ink-muted">{employee.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-elevated hover:text-ink"
                >
                  <IconClose className="size-5" />
                </button>
              </div>

              {/* Status & Quick Pill */}
              <div className="mt-4 flex items-center justify-between gap-3">
                <StatusBadge status={employee.status} />
                <span className="text-xs font-mono text-ink-faint">ID: {employee.id}</span>
              </div>

              {/* Tab Navigation */}
              <div className="mt-5 flex gap-1 rounded-xl border border-hairline bg-canvas/60 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("overview")}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                    activeTab === "overview"
                      ? "bg-elevated text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  Ikhtisar
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("timeline")}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                    activeTab === "timeline"
                      ? "bg-elevated text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  Riwayat Audit
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("credentials")}
                  className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                    activeTab === "credentials"
                      ? "bg-elevated text-ink shadow-sm"
                      : "text-ink-muted hover:text-ink"
                  }`}
                >
                  Kredensial
                </button>
              </div>

              {/* Tab Content */}
              <div className="mt-5 space-y-4">
                {activeTab === "overview" ? (
                  <div className="space-y-3.5 text-sm">
                    <div className="rounded-xl border border-hairline/80 bg-elevated/40 p-3.5 space-y-2.5">
                      <div className="flex items-center gap-2.5 text-ink-muted">
                        <IconBriefcase className="size-4 text-accent" />
                        <span className="text-xs text-ink-faint">Jabatan:</span>
                        <span className="ml-auto font-medium text-ink">{employee.jobTitle}</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-ink-muted">
                        <IconBuilding className="size-4 text-accent" />
                        <span className="text-xs text-ink-faint">Divisi:</span>
                        <span className="ml-auto font-medium text-ink">{employee.department}</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-ink-muted">
                        <IconUserCheck className="size-4 text-accent" />
                        <span className="text-xs text-ink-faint">Manager:</span>
                        <span className="ml-auto font-medium text-ink">{employee.managerName}</span>
                      </div>
                      <div className="flex items-center gap-2.5 text-ink-muted">
                        <IconMail className="size-4 text-accent" />
                        <span className="text-xs text-ink-faint">Email Manager:</span>
                        <span className="ml-auto font-mono text-xs text-ink">{employee.managerEmail}</span>
                      </div>
                    </div>

                    {employee.description ? (
                      <div className="rounded-xl border border-hairline/80 bg-canvas/50 p-3.5">
                        <p className="text-xs font-medium text-ink-faint">Catatan Pengajuan:</p>
                        <p className="mt-1 text-xs leading-relaxed text-ink-muted">{employee.description}</p>
                      </div>
                    ) : null}

                    {activeTicket ? (
                      <div className="rounded-xl border border-accent/30 bg-accent/10 p-3.5 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-semibold text-accent">Persetujuan Email Aktif</p>
                          <p className="text-xs text-ink-muted mt-0.5">Menunggu proses approval</p>
                        </div>
                        <a
                          href={activeTicket.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-mono text-xs font-bold text-accent hover:underline"
                        >
                          {activeTicket.key}
                          <IconExternal className="size-3.5" />
                        </a>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {activeTab === "timeline" ? (
                  <div className="space-y-4">
                    <p className="text-xs text-ink-muted">Simulasi rekam jejak audit persetujuan akun:</p>
                    <div className="relative pl-5 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-hairline-strong">
                      <div className="relative flex items-start gap-3">
                        <span className="absolute -left-5 top-1 size-2.5 rounded-full bg-ok shadow-[0_0_8px_var(--color-ok)]" />
                        <div>
                          <p className="text-xs font-semibold text-ink">Akun Terverifikasi & Aktif</p>
                          <p className="text-[11px] text-ink-faint">Sistem HC · {new Date(employee.updatedAt).toLocaleDateString("id-ID")}</p>
                        </div>
                      </div>
                      <div className="relative flex items-start gap-3">
                        <span className="absolute -left-5 top-1 size-2.5 rounded-full bg-info" />
                        <div>
                          <p className="text-xs font-semibold text-ink">IT Security Configured Access</p>
                          <p className="text-[11px] text-ink-faint">Oleh: Bagus Nugroho (IT Security)</p>
                        </div>
                      </div>
                      <div className="relative flex items-start gap-3">
                        <span className="absolute -left-5 top-1 size-2.5 rounded-full bg-accent" />
                        <div>
                          <p className="text-xs font-semibold text-ink">Manager Approved Request</p>
                          <p className="text-[11px] text-ink-faint">Oleh: {employee.managerName}</p>
                        </div>
                      </div>
                      <div className="relative flex items-start gap-3">
                        <span className="absolute -left-5 top-1 size-2.5 rounded-full bg-ink-faint" />
                        <div>
                          <p className="text-xs font-semibold text-ink">Akun Diajukan di HC Portal</p>
                          <p className="text-[11px] text-ink-faint">{new Date(employee.createdAt).toLocaleDateString("id-ID")}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}

                {activeTab === "credentials" ? (
                  <div className="space-y-3.5">
                    <div className="rounded-xl border border-hairline/80 bg-canvas/50 p-4 space-y-3">
                      <p className="text-xs font-semibold text-ink">Generator Kredensial Akses Awal</p>
                      <p className="text-xs text-ink-muted">
                        Buat kata sandi sementara untuk aktivasi pertama kali karyawan.
                      </p>

                      {generatedPass ? (
                        <div className="rounded-lg border border-accent/40 bg-surface p-3 flex items-center justify-between">
                          <span className="font-mono text-sm font-bold text-accent">{generatedPass}</span>
                          <span className="text-[10px] text-ok font-semibold">Berlaku 24 jam</span>
                        </div>
                      ) : (
                        <Button size="sm" onClick={generateTempPassword}>
                          Generate Password Sementara
                        </Button>
                      )}
                    </div>

                    <div className="rounded-xl border border-hairline/80 bg-canvas/50 p-4 space-y-3">
                      <p className="text-xs font-semibold text-ink">Link Aktivasi Langsung</p>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={copyActivationLink}
                        className="w-full justify-center"
                      >
                        {copiedLink ? "Link Disalin!" : "Salin Link Aktivasi Akun"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-8 border-t border-hairline pt-4 space-y-2">
              <Button
                variant="secondary"
                onClick={() => {
                  onOpenReportPDF?.(employee);
                }}
                className="w-full justify-center"
                icon={<IconDownload />}
              >
                Export PDF Laporan Karyawan
              </Button>
              <div className="flex gap-2">
                <Button
                  variant={employee.status === "ACTIVE" ? "danger" : "success"}
                  loading={busy}
                  onClick={() => onToggleAccess(employee)}
                  className="flex-1 justify-center"
                  icon={<IconPower />}
                >
                  {employee.status === "ACTIVE" ? "Nonaktifkan" : "Aktifkan"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    onClose();
                    onOpenTransfer(employee);
                  }}
                  className="flex-1 justify-center"
                  icon={<IconSwap />}
                >
                  Ubah Posisi
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </AnimatePresence>
  );
}
