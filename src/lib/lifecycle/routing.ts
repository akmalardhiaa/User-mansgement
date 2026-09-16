import type { Employee } from "@/lib/types";

import type { ActorIdentity, LifecyclePayload } from "./types";

/**
 * Who approves what.
 *
 * Routing is resolved by the server and frozen onto the request at submit.
 * HC never types an approver's address: the plan is explicit that the approver
 * comes from the division catalogue and the security function, not from a free
 * text box — otherwise "who approved this" becomes "whoever the requester chose
 * to ask", which is not an approval at all.
 *
 * The resolved identities are snapshotted rather than looked up again later, so
 * a manager changing after the fact cannot retroactively alter who a decision
 * was addressed to.
 */

export interface ApproverRouting {
  manager: ActorIdentity;
  ciso: ActorIdentity;
}

export class RoutingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutingError";
  }
}

/**
 * The demo CISO.
 *
 * Only ever used outside production, mirroring how devUsers.ts stands in for a
 * real directory. In production an unset CISO is a configuration error, and the
 * submit fails loudly: a request nobody is designated to approve is worse than
 * a request that could not be raised.
 */
const DEMO_CISO: ActorIdentity = {
  name: "Bagus Nugroho",
  email: "bagus.nugroho@example.com",
  userId: "bagus",
};

export function resolveCiso(): ActorIdentity {
  const email = process.env.CISO_APPROVER_EMAIL?.trim().toLowerCase();
  const name = process.env.CISO_APPROVER_NAME?.trim();

  if (email) return { name: name || email, email };

  if (process.env.NODE_ENV === "production") {
    throw new RoutingError(
      "CISO_APPROVER_EMAIL belum diset. Pengajuan tidak dapat dikirim tanpa approver CISO yang ditetapkan.",
    );
  }

  return DEMO_CISO;
}

/**
 * The manager who decides the first stage.
 *
 * Which manager depends on what is being asked, and the difference matters:
 *
 *   - Onboarding and Movement route to the manager of the division the person
 *     is going TO. They are the one who has to want the headcount.
 *   - Termination routes to the manager the person reports to NOW, because
 *     there is no destination and the current manager is the one affected.
 */
export function resolveManager(
  payload: LifecyclePayload,
  employee: Employee | undefined,
): ActorIdentity {
  if (payload.kind === "ONBOARDING") {
    return identity(payload.managerName, payload.managerEmail);
  }

  if (payload.kind === "MOVEMENT") {
    return identity(payload.toManagerName, payload.toManagerEmail);
  }

  if (!employee) {
    throw new RoutingError("Karyawan yang diajukan tidak ditemukan, manager tidak dapat ditentukan.");
  }
  if (!employee.managerEmail) {
    throw new RoutingError(
      `${employee.displayName} belum memiliki manager pada data direktori, sehingga pengajuan tidak dapat dirutekan.`,
    );
  }
  return identity(employee.managerName, employee.managerEmail);
}

function identity(name: string, email: string): ActorIdentity {
  const address = email.trim().toLowerCase();
  if (!address) throw new RoutingError("Alamat email approver kosong.");
  return { name: name.trim() || address, email: address };
}

export function resolveRouting(
  payload: LifecyclePayload,
  employee: Employee | undefined,
): ApproverRouting {
  return { manager: resolveManager(payload, employee), ciso: resolveCiso() };
}

/* -------------------------------------------------------------------------- */
/* Separation of duties                                                       */
/* -------------------------------------------------------------------------- */

export class SeparationOfDutiesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeparationOfDutiesError";
  }
}

/** Same human? Compared on the stable id when both carry one, else on address. */
export function isSamePerson(a: ActorIdentity, b: ActorIdentity): boolean {
  if (a.userId && b.userId) return a.userId.toLowerCase() === b.userId.toLowerCase();
  return a.email.trim().toLowerCase() === b.email.trim().toLowerCase();
}

/**
 * Refuses a routing where one person would wear two hats.
 *
 * Two approvals only mean something if two different people give them. This is
 * checked at submit rather than at decision time so the request is refused
 * before anybody is emailed about it — discovering the clash halfway through
 * would leave a request that cannot legitimately be completed.
 */
export function assertSeparationOfDuties(
  requester: ActorIdentity,
  routing: ApproverRouting,
): void {
  if (isSamePerson(requester, routing.manager)) {
    throw new SeparationOfDutiesError(
      "Pemohon tidak boleh menjadi manager yang menyetujui pengajuannya sendiri.",
    );
  }
  if (isSamePerson(requester, routing.ciso)) {
    throw new SeparationOfDutiesError(
      "Pemohon tidak boleh menjadi approver CISO untuk pengajuannya sendiri.",
    );
  }
  if (isSamePerson(routing.manager, routing.ciso)) {
    throw new SeparationOfDutiesError(
      "Manager dan CISO harus dua orang berbeda. Gunakan delegasi resmi bila keduanya bertabrakan.",
    );
  }
}
