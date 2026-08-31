import Link from "next/link";

import { RequestCard } from "@/components/requests/RequestCard";
import { SyncButton } from "@/components/dashboard/SyncButton";
import { Card } from "@/components/ui/Field";
import { listEmployees, listRequests } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export const metadata = { title: "Persetujuan · HC User Management" };

export default async function RequestsPage() {
  const [requests, employees] = await Promise.all([listRequests(), listEmployees()]);
  const byId = new Map(employees.map((employee) => [employee.id, employee]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Persetujuan pengajuan</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Semua pengajuan beserta tiket Jira dan jejak audit setiap perubahannya.
          </p>
        </div>
        <div className="ml-auto">
          <SyncButton />
        </div>
      </div>

      {requests.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-sm text-ink-muted">Belum ada pengajuan.</p>
          <Link
            href="/users/new"
            className="mt-4 inline-flex items-center rounded-lg border border-accent/60 bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-soft"
          >
            + Tambah akun
          </Link>
        </Card>
      ) : (
        <div className="space-y-5">
          {requests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              employee={byId.get(request.employeeId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
