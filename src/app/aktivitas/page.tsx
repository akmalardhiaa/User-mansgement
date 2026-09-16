import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { Reveal } from "@/components/motion/Reveal";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import { listActivity } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export const metadata = { title: "Aktivitas · HC User Management" };

export default async function ActivityPage() {
  const session = await requirePageSession("/aktivitas");
  if (!hasPermission(session.roles, "activity.read")) {
    return <AccessDenied roles={session.roles} need="Izin membaca jejak aktivitas" />;
  }

  const activity = await listActivity();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Jejak aktivitas"
        title="Riwayat aktivitas"
        description="Setiap perubahan pada direktori, siapa yang melakukannya, dan jam berapa."
      />

      <Reveal delay={0.06}>
        <ActivityFeed entries={activity} />
      </Reveal>
    </div>
  );
}
