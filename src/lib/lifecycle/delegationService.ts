import { randomUUID } from "node:crypto";

import type { PortalSession } from "@/lib/auth/session";
import { mutateStore, readStore, type StoreShape } from "@/lib/db/store";
import type { DelegationInput } from "@/lib/validation/delegationInput";

import { dayEnd, dayStart, refusalFor, stateOf, type Delegation } from "./delegation";
import {
  LifecycleError,
  identityOf,
  rerouteWaitingInDraft,
  type RerouteReport,
} from "./service";
import type { ActorIdentity } from "./types";

/**
 * Registering and ending delegations.
 *
 * Every rule about WHO is decided against the directory rather than taken
 * from the form: the absent manager must be somebody requests are actually
 * routed to, and the substitute must be an active employee. A delegation can
 * change who approves, so a typed address here would be the same hole the
 * manager picker had.
 */

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * The absent manager, as the directory knows them.
 *
 * Either an active employee, or someone recorded as the manager of an active
 * employee — requests are routed to the latter too, even when (as in the demo
 * roster) they are not on the roster themselves.
 */
function absentManager(draft: StoreShape, email: string): ActorIdentity | undefined {
  const employee = draft.employees.find(
    (candidate) => sameAddress(candidate.email, email) && candidate.status === "ACTIVE",
  );
  if (employee) return { name: employee.displayName, email: employee.email.toLowerCase() };

  const managed = draft.employees.find(
    (candidate) => candidate.status === "ACTIVE" && sameAddress(candidate.managerEmail ?? "", email),
  );
  if (managed) return { name: managed.managerName || email, email: email.toLowerCase() };
  return undefined;
}

function substitute(draft: StoreShape, email: string): ActorIdentity | undefined {
  const employee = draft.employees.find(
    (candidate) => sameAddress(candidate.email, email) && candidate.status === "ACTIVE",
  );
  return employee ? { name: employee.displayName, email: employee.email.toLowerCase() } : undefined;
}

export async function listDelegations(): Promise<Delegation[]> {
  const { delegations } = await readStore();
  return [...delegations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export interface CreatedDelegation {
  delegation: Delegation;
  reroute?: RerouteReport;
}

export async function createDelegation(
  input: DelegationInput,
  session: PortalSession,
  at = new Date(),
): Promise<CreatedDelegation> {
  const actor = identityOf(session);

  return mutateStore((draft) => {
    const from = absentManager(draft, input.fromEmail);
    if (!from) {
      throw new LifecycleError(
        "INVALID",
        `${input.fromEmail} bukan manager yang tercatat di direktori, jadi tidak ada persetujuan yang bisa didelegasikan.`,
      );
    }

    const to = substitute(draft, input.toEmail);
    if (!to) {
      throw new LifecycleError(
        "INVALID",
        `Pengganti harus karyawan aktif di direktori. ${input.toEmail} tidak ditemukan atau tidak aktif.`,
      );
    }

    // Registering a delegation to yourself would let one HC officer appoint
    // themselves the approver of requests their colleagues raise.
    if (sameAddress(to.email, actor.email)) {
      throw new LifecycleError(
        "FORBIDDEN",
        "Anda tidak bisa menunjuk diri sendiri sebagai pengganti. Minta rekan HC lain mendaftarkannya.",
      );
    }

    const startsAt = dayStart(input.startDate);
    const endsAt = dayEnd(input.endDate);

    const refusal = refusalFor({ from, to, startsAt, endsAt }, draft.delegations, at);
    if (refusal) throw new LifecycleError("INVALID", refusal);

    if (input.reroutePending && startsAt > at.toISOString()) {
      throw new LifecycleError(
        "INVALID",
        "Pengajuan yang sedang menunggu hanya bisa dialihkan bila delegasinya sudah berlaku hari ini. Daftarkan tanpa opsi itu, atau mulai delegasinya hari ini.",
      );
    }

    const delegation: Delegation = {
      id: `dlg_${randomUUID()}`,
      from,
      to,
      startsAt,
      endsAt,
      reason: input.reason,
      createdBy: actor,
      createdAt: at.toISOString(),
    };
    draft.delegations.push(delegation);

    draft.auditEvents.push({
      id: `evt_${randomUUID()}`,
      at: at.toISOString(),
      actorId: actor.userId ?? actor.email,
      actorName: actor.name,
      source: "PORTAL",
      action: "delegation.created",
      target: delegation.id,
      correlationId: delegation.id,
      detail: { from: from.email, to: to.email, startsAt, endsAt },
    });

    const reroute = input.reroutePending ? rerouteWaitingInDraft(draft, delegation, actor) : undefined;
    return { delegation, reroute };
  });
}

/**
 * Ends a delegation early — the manager came back sooner.
 *
 * Requests already sent to the substitute stay with them: they hold a live
 * link, and pulling it back would be a second reroute nobody asked for. New
 * requests go to the manager again from this moment.
 */
export async function endDelegation(
  id: string,
  session: PortalSession,
  at = new Date(),
): Promise<Delegation> {
  const actor = identityOf(session);

  return mutateStore((draft) => {
    const delegation = draft.delegations.find((candidate) => candidate.id === id);
    if (!delegation) throw new LifecycleError("NOT_FOUND", "Delegasi tidak ditemukan.");
    if (stateOf(delegation, at) === "ENDED") {
      throw new LifecycleError("CONFLICT", "Delegasi ini sudah berakhir.");
    }

    delegation.endedAt = at.toISOString();
    delegation.endedBy = actor;

    draft.auditEvents.push({
      id: `evt_${randomUUID()}`,
      at: at.toISOString(),
      actorId: actor.userId ?? actor.email,
      actorName: actor.name,
      source: "PORTAL",
      action: "delegation.ended",
      target: delegation.id,
      correlationId: delegation.id,
      detail: { from: delegation.from.email, to: delegation.to.email },
    });

    return delegation;
  });
}

/**
 * Everyone a delegation could be for: the managers requests are routed to.
 * For the form's picker — the service re-checks whatever comes back.
 */
export async function delegableManagers(): Promise<ActorIdentity[]> {
  const draft = await readStore();
  const seen = new Map<string, ActorIdentity>();

  for (const employee of draft.employees) {
    if (employee.status !== "ACTIVE" || !employee.managerEmail) continue;
    const manager = absentManager(draft, employee.managerEmail);
    if (manager && !seen.has(manager.email)) seen.set(manager.email, manager);
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}
