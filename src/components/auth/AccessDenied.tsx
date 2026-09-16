import Link from "next/link";

import { Card } from "@/components/ui/Field";
import type { PortalRole } from "@/lib/auth/roles";

const ROLE_LABEL: Record<PortalRole, string> = {
  HC_REQUESTER: "Human Capital",
  MANAGER: "Manager",
  CISO_APPROVER: "CISO / IT Security",
  SYSTEM_ADMIN: "Administrator sistem",
  OPS_OPERATOR: "Operator",
  AUDITOR: "Auditor",
};

/**
 * Shown to somebody who is signed in but whose roles do not cover this page.
 *
 * A refusal that explains itself, rather than an empty screen or a redirect
 * that looks like a bug. Being in Active Directory does not confer authority
 * here, and the person hitting this wall has no way to know that unless the
 * page says so and names who can fix it.
 */
export function AccessDenied({ roles, need }: { roles: PortalRole[]; need: string }) {
  return (
    <Card className="p-8">
      <h1 className="text-lg font-semibold text-ink">Akses ditolak</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-muted">
        Akun Anda berhasil masuk, tetapi peran portal Anda tidak mencakup halaman ini.
      </p>

      <dl className="mt-5 space-y-3 text-sm">
        <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-3">
          <dt className="text-ink-muted">Dibutuhkan</dt>
          <dd className="font-medium text-ink">{need}</dd>
        </div>
        <div className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:gap-3">
          <dt className="text-ink-muted">Peran Anda</dt>
          <dd className="font-medium text-ink">
            {roles.length > 0
              ? roles.map((role) => ROLE_LABEL[role] ?? role).join(", ")
              : "Belum ada peran portal"}
          </dd>
        </div>
      </dl>

      <p className="mt-5 max-w-prose text-xs text-ink-faint">
        Peran portal berasal dari keanggotaan group Active Directory. Hubungi administrator
        sistem bila Anda seharusnya memiliki akses ini.
      </p>

      <Link
        href="/profile"
        className="mt-6 inline-flex text-sm text-ink-muted underline underline-offset-4 transition-colors hover:text-ink"
      >
        Lihat profil saya
      </Link>
    </Card>
  );
}
