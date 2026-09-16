import { accessProfileLabel } from "@/lib/lifecycle/accessProfiles";
import type { LifecyclePayload, TerminationReason } from "@/lib/lifecycle/types";

const REASON_LABEL: Record<TerminationReason, string> = {
  RESIGN: "Mengundurkan diri",
  CONTRACT_END: "Kontrak berakhir",
  RETIREMENT: "Pensiun",
  TERMINATION: "Pemutusan hubungan kerja",
  OTHER: "Lainnya",
};

/**
 * The locked payload, as the approvers see it.
 *
 * This is what the fingerprint covers, so it is rendered from the stored
 * payload rather than reassembled from the employee record: an approver must be
 * looking at the same text the hash was taken over, not at a live join that
 * could have moved underneath it.
 *
 * The termination note is deliberately absent. It is an internal HC note, it is
 * not part of what an approver needs in order to decide, and the plan is
 * explicit that the circumstances of somebody leaving do not travel further
 * than they must.
 */
export function RequestPayloadSummary({ payload }: { payload: LifecyclePayload }) {
  const rows: Array<[string, string]> =
    payload.kind === "ONBOARDING"
      ? [
          ["NIK", payload.nik],
          ["Nama", payload.displayName],
          ["Email", payload.email],
          ["Jabatan", payload.jobTitle],
          ["Departemen", payload.department],
          [
            "Status kepegawaian",
            payload.employmentType === "CONTRACT"
              ? `Kontrak · berakhir ${payload.expiredDate ?? "—"}`
              : "Karyawan tetap",
          ],
          [
            "Lokasi",
            payload.locationType === "CABANG"
              ? `Cabang · ${payload.branchName ?? "—"}`
              : "Kantor pusat",
          ],
          ["Manager", `${payload.managerName} · ${payload.managerEmail}`],
          ["Mulai bekerja", payload.startDate],
          ["Profil akses", accessProfileLabel(payload.accessProfileId)],
          ...(payload.jobDescription ? [["Keterangan jabatan", payload.jobDescription] as [string, string]] : []),
        ]
      : payload.kind === "MOVEMENT"
        ? [
            ["Departemen tujuan", payload.toDepartment],
            ["Jabatan tujuan", payload.toJobTitle],
            ["Manager tujuan", `${payload.toManagerName} · ${payload.toManagerEmail}`],
            ["Profil akses baru", accessProfileLabel(payload.accessProfileId)],
            ["Alasan", payload.reason],
            ...(payload.toJobDescription
              ? [["Keterangan jabatan", payload.toJobDescription] as [string, string]]
              : []),
          ]
        : [
            ["Kategori alasan", REASON_LABEL[payload.reasonCategory]],
            ["Tanggal terakhir bekerja", payload.lastWorkingDate],
            ...(payload.handoverTo ? [["Serah terima kepada", payload.handoverTo] as [string, string]] : []),
            ["Tindakan", "Nonaktifkan dan karantina akun — bukan hapus permanen"],
          ];

  return (
    <dl className="divide-y divide-hairline/60">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[13rem_1fr] sm:gap-3">
          <dt className="text-sm text-ink-muted">{label}</dt>
          <dd className="text-sm font-medium break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
