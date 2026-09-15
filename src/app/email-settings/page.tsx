import { redirect } from "next/navigation";

import { EmailSettings } from "@/components/email/EmailSettings";
import { Card } from "@/components/ui/Field";
import { IconAlert } from "@/components/ui/Icons";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pengaturan email · HC User Management" };

/** Admin only: connecting a mailbox decides whose name every approval email goes out under. */
export default async function EmailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/email-settings");

  if (user.role !== "ADMIN") {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Pengaturan" title="Pengaturan email" />
        <Card className="p-6 text-sm">
          <p className="flex items-center gap-2 font-medium text-warn">
            <IconAlert className="size-4" />
            Halaman ini hanya untuk admin.
          </p>
        </Card>
      </div>
    );
  }

  const { connected, error } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pengaturan"
        title="Pengaturan email"
        description="Hubungkan kotak masuk Outlook sekali, lalu semua email persetujuan terkirim otomatis ke alamat manager, CISO, dan karyawan."
      />
      <EmailSettings
        initialNotice={{
          connected: typeof connected === "string" ? connected : undefined,
          error: typeof error === "string" ? error : undefined,
        }}
      />
    </div>
  );
}
