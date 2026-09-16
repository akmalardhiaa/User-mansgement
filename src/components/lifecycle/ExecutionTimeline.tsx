import { Card } from "@/components/ui/Field";
import type { ExecutionJob } from "@/lib/lifecycle/executionTypes";

/**
 * What the worker actually did to the directory.
 *
 * Step by step, with the ones that failed shown as failed. This is the screen
 * that has to be honest when things go wrong: an onboarding that created an
 * account and then could not grant its groups left something real behind, and
 * an operator deciding what to do next needs to see exactly how far it got —
 * not a single red word.
 */

const ERROR_LABEL: Record<string, string> = {
  DRIFT: "Kondisi akun berubah sejak disetujui",
  PAYLOAD_MISMATCH: "Isi pengajuan tidak cocok dengan yang disetujui",
  AD_PERMISSION: "Hak worker tidak cukup",
  AD_CONFLICT: "Objek bentrok di direktori",
  AD_NOT_FOUND: "Objek tidak ditemukan",
  AD_TIMEOUT_AFTER_WRITE: "Waktu tunggu habis setelah perubahan dikirim",
  AD_UNAVAILABLE: "Direktori tidak dapat dihubungi",
  VERIFY_FAILED: "Hasil tidak cocok saat dibaca ulang",
  UNKNOWN: "Kesalahan tidak dikenal",
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(iso));
}

export function ExecutionTimeline({ jobs }: { jobs: ExecutionJob[] }) {
  if (jobs.length === 0) return null;

  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold text-ink">Eksekusi ke direktori</h2>

      {jobs.map((job) => (
        <div key={job.operationId} className="mt-4">
          <p className="font-mono text-[11px] break-all text-ink-faint">
            {job.operationId} · percobaan {job.attempt}
          </p>

          <ol className="mt-3 space-y-2.5">
            {job.steps.map((step) => (
              <li key={`${job.operationId}-${step.stepKey}`} className="flex items-start gap-2.5">
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${
                    step.state === "DONE" ? "bg-ok" : step.state === "FAILED" ? "bg-danger" : "bg-ink-faint"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block font-mono text-xs text-ink">{step.stepKey}</span>
                  {step.errorMessage ? (
                    <span className="block text-xs text-danger">{step.errorMessage}</span>
                  ) : null}
                  {step.at ? (
                    <span className="block text-[11px] text-ink-faint">{formatDate(step.at)}</span>
                  ) : null}
                </span>
              </li>
            ))}
            {job.steps.length === 0 ? (
              <li className="text-xs text-ink-muted">
                Belum ada langkah yang dijalankan — dihentikan sebelum menyentuh direktori.
              </li>
            ) : null}
          </ol>

          {job.errorCode ? (
            <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3.5 py-2.5 text-xs text-danger">
              <p className="font-semibold">{ERROR_LABEL[job.errorCode] ?? job.errorCode}</p>
              {job.errorMessage ? <p className="mt-0.5">{job.errorMessage}</p> : null}
              {job.errorCode === "DRIFT" ? (
                <p className="mt-1.5 text-ink-muted">
                  Mengulang tidak akan membantu: persetujuan diberikan untuk keadaan yang sudah
                  tidak berlaku. Ajukan ulang agar kedua approver menilai keadaan sekarang.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </Card>
  );
}
