import { AccessDenied } from "@/components/auth/AccessDenied";
import { DelegationManager, type DelegationRow } from "@/components/delegation/DelegationManager";
import { PageHeader } from "@/components/ui/PageHeader";
import { requirePageSession } from "@/lib/auth/current";
import { hasPermission } from "@/lib/auth/roles";
import { listEmployees } from "@/lib/db/repository";
import { stateOf } from "@/lib/lifecycle/delegation";
import { delegableManagers, listDelegations } from "@/lib/lifecycle/delegationService";

export const dynamic = "force-dynamic";

export const metadata = { title: "Delegasi · HC User Management" };

/**
 * Who answers for a manager while they are away.
 *
 * Managers do not sign in here, so HC registers the delegation on their behalf.
 * Everything this page offers is re-checked by the API.
 */
export default async function DelegationPage() {
  const session = await requirePageSession("/delegasi");
  if (!hasPermission(session.roles, "delegation.manage")) {
    return <AccessDenied roles={session.roles} need="Izin mengelola delegasi" />;
  }

  const [delegations, managers, employees] = await Promise.all([
    listDelegations(),
    delegableManagers(),
    listEmployees(),
  ]);

  const now = new Date();
  const rows: DelegationRow[] = delegations.map((delegation) => ({
    ...delegation,
    state: stateOf(delegation, now),
  }));

  const substitutes = employees
    .filter((employee) => employee.status === "ACTIVE")
    .map((employee) => ({ name: employee.displayName, email: employee.email.toLowerCase() }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Persetujuan"
        title="Delegasi manager"
        description="Saat manager berhalangan, persetujuan tahap pertama dialihkan ke pengganti selama periode tertentu. Tahap CISO tidak perlu delegasi — dikirim ke seluruh tim."
      />
      <DelegationManager
        managers={managers}
        substitutes={substitutes}
        delegations={rows}
        me={session.email.toLowerCase()}
      />
    </div>
  );
}
