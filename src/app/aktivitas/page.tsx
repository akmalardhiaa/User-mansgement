import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { AccessDenied } from "@/components/auth/AccessDenied";
import { Reveal } from "@/components/motion/Reveal";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { getTranslations } from "@/lib/i18n/server";
import { hasPermission } from "@/lib/auth/roles";
import { listActivity } from "@/lib/db/repository";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getTranslations();
  return { title: t.activity.metaTitle };
}

export default async function ActivityPage() {
  const { t } = await getTranslations();
  const session = await requirePageSession("/aktivitas");
  if (!hasPermission(session.roles, "activity.read")) {
    return <AccessDenied roles={session.roles} need={t.activity.need} />;
  }

  const activity = await listActivity();

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t.activity.eyebrow}
        title={t.activity.title}
        description={t.execution.activityDescription}
      />

      <Reveal delay={0.06}>
        <ActivityFeed entries={activity} />
      </Reveal>
    </div>
  );
}
