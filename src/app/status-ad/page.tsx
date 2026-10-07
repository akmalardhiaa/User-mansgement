import { AccessDenied } from "@/components/auth/AccessDenied";
import { AdStatusRefresh } from "@/components/ad/AdStatusRefresh";
import { AdStatusView, CheckList, SecurityLogCard } from "@/components/ad/AdStatusView";
import { PageHeader } from "@/components/ui/PageHeader";
import { runAdDiagnostics } from "@/lib/ad/diagnostics";
import { requirePageSession } from "@/lib/auth/current";
import { recentSecurityEvents } from "@/lib/auth/securityLog";
import { hasPermission } from "@/lib/auth/roles";
import { getTranslations } from "@/lib/i18n/server";
import { runPortalChecks } from "@/lib/system/portalChecks";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { t } = await getTranslations();
  return { title: t.adStatus.metaTitle };
}

export default async function AdStatusPage() {
  const { t } = await getTranslations();
  const session = await requirePageSession("/status-ad");
  if (!hasPermission(session.roles, "execution.run")) {
    return <AccessDenied roles={session.roles} need={t.adStatus.title} />;
  }

  // Independent of each other: an SMTP server that is slow to answer should
  // not make the directory checks wait.
  const [report, portalChecks, securityEvents] = await Promise.all([
    runAdDiagnostics(),
    runPortalChecks(),
    recentSecurityEvents(30),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={t.adStatus.eyebrow}
        title={t.adStatus.title}
        description={t.adStatus.description}
        actions={<AdStatusRefresh label={t.adStatus.refresh} />}
      />
      <AdStatusView report={report} />
      <CheckList title={t.adStatus.portalTitle} checks={portalChecks} />
      <SecurityLogCard events={securityEvents} />
    </div>
  );
}
