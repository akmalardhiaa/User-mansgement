"use client";

import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/Button";
import { IconClose, IconDownload, IconPrinter } from "@/components/ui/Icons";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { Employee, ApprovalReference } from "@/lib/types";

interface EmployeeReportModalProps {
  employee: Employee | null;
  activeTicket?: ApprovalReference;
  onClose: () => void;
}

/**
 * A checksum that actually identifies the document.
 *
 * This was Math.random(), which produced a different "signature" on every
 * re-render and a different one again on the printed copy — so two printouts
 * of the same record never matched, which is the one thing a checksum is for.
 * FNV-1a over the fields the report states, so the same record always yields
 * the same value and an edited one does not.
 */
function checksum(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    // The FNV prime, as shifts: Math.imul keeps this in 32-bit space instead
    // of drifting into float territory on long inputs.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).toUpperCase().padStart(7, "0");
}

export function EmployeeReportModal({
  employee,
  activeTicket,
  onClose,
}: EmployeeReportModalProps) {
  if (!employee) return null;

  function handlePrint() {
    window.print();
  }

  const currentDate = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-canvas/80 backdrop-blur-md print:hidden"
        />

        {/* Modal Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          className="relative z-10 w-full max-w-3xl rounded-2xl border border-hairline-strong bg-surface p-6 sm:p-8 shadow-2xl print:m-0 print:w-full print:max-w-none print:border-none print:bg-white print:p-0 print:text-black print:shadow-none"
        >
          {/* Action Bar (Hidden in Print) */}
          <div className="flex items-center justify-between border-b border-hairline pb-4 mb-6 print:hidden">
            <div>
              <h3 className="text-base font-bold text-ink">Pratinjau Dokumen PDF Karyawan</h3>
              <p className="text-xs text-ink-muted">Siap disimpan sebagai PDF atau dicetak langsung.</p>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={handlePrint} icon={<IconPrinter />}>
                Cetak / Simpan PDF
              </Button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-ink-faint hover:bg-elevated hover:text-ink"
              >
                <IconClose className="size-5" />
              </button>
            </div>
          </div>

          {/* PRINTABLE REPORT DOCUMENT BODY */}
          <div id="printable-report" className="space-y-6 text-ink print:text-black">
            {/* Header Letterhead */}
            <div className="flex items-start justify-between border-b-2 border-accent pb-5 print:border-black">
              <div>
                <span className="inline-block rounded-md bg-accent/20 px-2.5 py-1 text-xs font-extrabold text-accent uppercase tracking-widest print:border print:border-black print:text-black">
                  HC MANAGEMENT SYSTEM
                </span>
                <h1 className="mt-2 text-xl font-bold tracking-tight text-ink print:text-black">
                  LAPORAN REKAPITULASI HAK AKSES KARYAWAN
                </h1>
                <p className="text-xs text-ink-muted print:text-gray-600">
                  Dokumen Resmi Pengelolaan Akun & Persetujuan Izin Akses Sistem Internal
                </p>
              </div>
              <div className="text-right text-xs text-ink-muted print:text-gray-600 space-y-0.5">
                <p className="font-semibold text-ink print:text-black">PT Mandiri Sekuritas</p>
                <p>Human Capital Division</p>
                <p className="font-mono text-[11px]">{currentDate}</p>
              </div>
            </div>

            {/* Employee Profile Summary Box */}
            <div className="rounded-xl border border-hairline bg-canvas/60 p-5 space-y-4 print:border-gray-300 print:bg-gray-50">
              <div className="flex items-center justify-between border-b border-hairline/80 pb-3 print:border-gray-200">
                <div>
                  <h2 className="text-lg font-extrabold text-ink print:text-black">
                    {employee.displayName}
                  </h2>
                  <p className="text-xs text-ink-muted print:text-gray-600">{employee.email}</p>
                </div>
                <div className="print:hidden">
                  <StatusBadge status={employee.status} />
                </div>
                <div className="hidden print:block font-bold text-xs uppercase text-gray-800">
                  STATUS: {employee.status}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-3">
                <div>
                  <span className="block font-medium text-ink-faint print:text-gray-500">ID Karyawan:</span>
                  <span className="font-mono font-bold text-ink print:text-black">{employee.id}</span>
                </div>
                <div>
                  <span className="block font-medium text-ink-faint print:text-gray-500">Jabatan:</span>
                  <span className="font-semibold text-ink print:text-black">{employee.jobTitle}</span>
                </div>
                <div>
                  <span className="block font-medium text-ink-faint print:text-gray-500">Divisi / Departemen:</span>
                  <span className="font-semibold text-ink print:text-black">{employee.department}</span>
                </div>
                <div>
                  <span className="block font-medium text-ink-faint print:text-gray-500">Manager Penanggung Jawab:</span>
                  <span className="font-semibold text-ink print:text-black">{employee.managerName}</span>
                </div>
                <div>
                  <span className="block font-medium text-ink-faint print:text-gray-500">Email Manager:</span>
                  <span className="font-mono text-ink print:text-black">{employee.managerEmail}</span>
                </div>
                <div>
                  <span className="block font-medium text-ink-faint print:text-gray-500">Tanggal Terdaftar:</span>
                  <span className="text-ink print:text-black">
                    {new Date(employee.createdAt).toLocaleDateString("id-ID")}
                  </span>
                </div>
              </div>

              {employee.description ? (
                <div className="mt-2 border-t border-hairline/60 pt-3 text-xs">
                  <span className="font-semibold text-ink-faint print:text-gray-600">Catatan Pengajuan HC:</span>
                  <p className="mt-0.5 text-ink-muted print:text-gray-800 leading-relaxed">{employee.description}</p>
                </div>
              ) : null}
            </div>

            {/* Approval Workflow & Audit Trail Table */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold tracking-wider uppercase text-ink-faint print:text-gray-700">
                Rekam Jejak Persetujuan Akses (Audit Trail)
              </h3>
              <table className="w-full text-left text-xs border border-hairline rounded-lg overflow-hidden print:border-gray-300">
                <thead>
                  <tr className="bg-canvas text-ink-faint uppercase tracking-wider border-b border-hairline print:bg-gray-200 print:text-black print:border-gray-300">
                    <th className="px-3 py-2">Tahap Workflow</th>
                    <th className="px-3 py-2">Otoritas / Pelaksana</th>
                    <th className="px-3 py-2">Referensi persetujuan</th>
                    <th className="px-3 py-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline print:divide-gray-300">
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink print:text-black">1. Pengajuan Akun Baru</td>
                    <td className="px-3 py-2 text-ink-muted print:text-gray-700">HC Officer Portal</td>
                    <td className="px-3 py-2 font-mono text-ink-faint print:text-gray-600">HC-REQ-{employee.id.slice(-4)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-ok print:text-black">SELESAI</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink print:text-black">2. Persetujuan Manager</td>
                    <td className="px-3 py-2 text-ink-muted print:text-gray-700">{employee.managerName}</td>
                    <td className="px-3 py-2 font-mono text-accent print:text-black">{activeTicket?.key || "MND-8941"}</td>
                    <td className="px-3 py-2 text-right font-semibold text-ok print:text-black">APPROVED</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-medium text-ink print:text-black">3. Provisioning IT Security</td>
                    <td className="px-3 py-2 text-ink-muted print:text-gray-700">IT Security Team</td>
                    <td className="px-3 py-2 font-mono text-accent print:text-black">SEC-2041</td>
                    <td className="px-3 py-2 text-right font-semibold text-ok print:text-black">PROVISIONED</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Official Signatures & Verification Block */}
            <div className="pt-6 border-t border-hairline flex items-end justify-between text-xs text-ink-muted print:border-gray-300 print:text-gray-700">
              <div className="space-y-1">
                <p className="font-semibold text-ink print:text-black">Verifikasi Sistem Portal HC</p>
                <p className="text-[11px]">Dokumen ini dibuat otomatis oleh sistem HC User Management.</p>
                <p className="text-[10px] font-mono text-ink-faint print:text-gray-500">
                  Checksum Signature: {checksum(`${employee.id}|${employee.email}|${employee.updatedAt}`)}
                </p>
              </div>

              <div className="text-center w-40 space-y-10 print:text-black">
                <p className="font-semibold">Petugas Human Capital</p>
                <div className="border-b border-ink/40 print:border-black font-bold text-ink print:text-black">
                  ( Admin HC )
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
