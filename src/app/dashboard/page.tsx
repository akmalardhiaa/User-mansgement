import Link from "next/link";
import { redirect } from "next/navigation";

import { UserDashboard } from "@/components/accounts/UserDashboard";
import { Card } from "@/components/ui/Field";
import { IconAlert } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata = { title: "Kelola akun · HC User Management" };

/**
 * Admin console for login accounts.
 *
 * The role is checked here as well as in the API. This check is what keeps the
 * page from rendering, and the one in GET /api/accounts is what keeps the data
 * from being fetched — a page-only check would still hand the list to anyone
 * who called the endpoint directly.
 */
export default async function DashboardPage() {
  const user = await getCurrentUser();

  // The proxy already redirects anonymous visitors; this covers the gap between
  // a token expiring and the next request.
  if (!user) redirect("/login?next=/dashboard");

  if (user.role !== "ADMIN") {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Akun"
          title="Kelola akun"
          description="Halaman ini hanya untuk admin."
        />
        <Card className="p-6">
          <p className="flex items-center gap-2 font-medium text-warn">
            <IconAlert className="size-4" />
            Akses ditolak
          </p>
          <p className="mt-2 text-sm text-ink-muted">
            Akun Anda terdaftar sebagai <span className="font-mono text-ink">{user.role}</span>.
            Hubungi admin jika Anda memerlukan akses ini, atau kembali ke{" "}
            <Link href="/" className="font-medium text-accent hover:underline">
              direktori karyawan
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Akun"
        title="Kelola akun"
        description="Semua akun yang bisa masuk ke portal. Berbeda dari direktori karyawan, yang mencatat siapa yang bekerja di sini."
      />
      <UserDashboard currentUserId={user.id} />
    </div>
  );
}
