import Link from "next/link";

import { RequestsBoard } from "@/components/requests/RequestsBoard";
import { buttonClasses } from "@/components/ui/Button";
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
        description="Semua pengajuan beserta status persetujuannya dan jejak audit setiap perubahan."
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
            className={`mt-4 ${buttonClasses()}`}
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
