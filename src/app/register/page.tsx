import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateUserForm } from "@/components/approval/CreateUserForm";
import { Card } from "@/components/ui/Field";
import { IconAlert } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata = { title: "Buat user · HC User Management" };

/**
 * HC creates an account that stays locked until the manager and the CISO both
 * approve it. Admin only: the approvers are typed into this form, so an open
 * form would let anyone name themselves as their own approver.
 */
export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/register");

  if (user.role !== "ADMIN") {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Approval" title="Buat user baru" />
        <Card className="p-6 text-sm">
          <p className="flex items-center gap-2 font-medium text-warn">
            <IconAlert className="size-4" />
            Hanya Human Capital (admin) yang dapat membuat user.
          </p>
          <p className="mt-2 text-ink-muted">
            Kembali ke{" "}
            <Link href="/" className="font-medium text-accent hover:underline">
              dashboard
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
        eyebrow="Approval"
        title="Buat user baru"
        description="Akun dibuat nonaktif. Manager menerima email persetujuan, lalu CISO / IT Security. Setelah keduanya setuju, akun aktif dan user diberi tahu lewat email."
      />
      <CreateUserForm />
    </div>
  );
}
