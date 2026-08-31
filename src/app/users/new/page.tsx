import Link from "next/link";

import { CreateUserForm } from "@/components/users/CreateUserForm";

export const metadata = { title: "Tambah akun · HC User Management" };

const WORKFLOW = [
  ["1", "HC mengajukan", "Karyawan tercatat sebagai Menunggu manager — akun belum dibuat."],
  ["2", "Manager menyetujui", "Tiket Jira di-assign ke manager yang bersangkutan."],
  ["3", "IT Security menyiapkan", "Persetujuan otomatis membuat tiket penyiapan akses."],
  ["4", "Akun aktif", "Menutup tiket penyiapan mengubah status menjadi Aktif."],
] as const;

export default function NewUserPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="text-sm text-ink-muted hover:text-ink">
          ← Kembali ke direktori
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Tambah akun baru</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Pengajuan melewati persetujuan manager dan penyiapan akses IT Security sebelum akun
          menjadi aktif.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <CreateUserForm />

        <aside className="rounded-2xl border border-hairline bg-surface/60 p-5">
          <h2 className="text-xs tracking-wide text-ink-faint uppercase">Tahapan selanjutnya</h2>
          <ol className="mt-4 space-y-4">
            {WORKFLOW.map(([step, title, detail]) => (
              <li key={step} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full border border-hairline-strong bg-elevated text-[11px] font-semibold text-ink-muted">
                  {step}
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink">{title}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{detail}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
