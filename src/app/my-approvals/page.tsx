import { redirect } from "next/navigation";

import { MyApprovals } from "@/components/approval/MyApprovals";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser } from "@/lib/auth/current";

export const dynamic = "force-dynamic";

export const metadata = { title: "Persetujuan saya · HC User Management" };

/** The signed-in approver's inbox. Anyone signed in may open it; each sees only what names them. */
export default async function MyApprovalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/my-approvals");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Approval"
        title="Persetujuan saya"
        description="Pengajuan akun yang menunggu keputusan Anda sebagai manager atau CISO. Muncul otomatis begitu HC mengajukan — tanpa perlu email."
      />
      <MyApprovals />
    </div>
  );
}
