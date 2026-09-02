import Link from "next/link";

import { Reveal } from "@/components/motion/Reveal";
import { CreateUserForm } from "@/components/users/CreateUserForm";
import { IconClock } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";

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
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <span aria-hidden>←</span>
          Kembali ke direktori
        </Link>
        <div className="mt-2">
          <PageHeader
            eyebrow="Pengajuan baru"
            title="Tambah akun baru"
            description="Pengajuan melewati persetujuan manager dan penyiapan akses IT Security sebelum akun menjadi aktif."
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Reveal delay={0.06}>
          <CreateUserForm />
        </Reveal>

        <Reveal delay={0.14}>
          <aside className="sticky top-[4.5rem] rounded-2xl border border-hairline bg-surface/60 p-5 backdrop-blur-sm">
            <h2 className="flex items-center gap-2 text-xs tracking-[0.14em] text-ink-faint uppercase">
              <IconClock className="size-3.5" />
              Tahapan selanjutnya
            </h2>
            <ol className="mt-4 space-y-4">
              {WORKFLOW.map(([step, title, detail], index) => (
                <li key={step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span
                      className={`grid size-6 shrink-0 place-items-center rounded-full border text-[11px] font-semibold ${
                        // Step one is where the user is standing right now.
                        index === 0
                          ? "border-accent/50 bg-accent/15 text-accent"
                          : "border-hairline-strong bg-elevated text-ink-muted"
                      }`}
                    >
                      {step}
                    </span>
                    {index < WORKFLOW.length - 1 ? (
                      <span className="mt-1 w-px flex-1 bg-hairline-strong" aria-hidden />
                    ) : null}
                  </div>
                  <span className="pb-1">
                    <span className="block text-sm font-medium text-ink">{title}</span>
                    <span className="mt-0.5 block text-xs text-ink-muted">{detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </Reveal>
      </div>
    </div>
  );
}
