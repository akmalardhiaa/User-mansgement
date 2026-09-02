import Link from "next/link";

import { SyncButton } from "@/components/dashboard/SyncButton";
import { RequestsBoard } from "@/components/requests/RequestsBoard";
import { Card } from "@/components/ui/Field";
import { IconApprovals, IconUserPlus } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { listEmployees, listRequests } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export const metadata = { title: "Persetujuan · HC User Management" };

export default async function RequestsPage() {
  const [requests, employees] = await Promise.all([listRequests(), listEmployees()]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Alur persetujuan"
        title="Persetujuan pengajuan"
        description="Semua pengajuan beserta tiket Jira dan jejak audit setiap perubahannya."
        actions={<SyncButton />}
      />

      {requests.length === 0 ? (
        <Card className="p-12 text-center">
          {/* The same circled-glyph empty state the directory and the filtered
              approvals list use, so "nothing here" looks the same everywhere. */}
          <span className="mx-auto grid size-12 place-items-center rounded-full border border-hairline bg-elevated/60 text-ink-faint">
            <IconApprovals className="size-5" />
          </span>
          <p className="mt-3 text-sm text-ink-muted">Belum ada pengajuan.</p>
          <Link
            href="/users/new"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-accent/70 bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-all duration-200 hover:bg-accent-soft active:scale-[0.97]"
          >
            <IconUserPlus className="size-4" />
            Tambah akun
          </Link>
        </Card>
      ) : (
        <RequestsBoard requests={requests} employees={employees} />
      )}
    </div>
  );
}
