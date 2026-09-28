import type { Employee } from "@/lib/types";

import type { ActorIdentity, ApprovalStep, LifecyclePayload } from "./types";

/** Everyone who may answer a stage: its team, or the one person it was addressed to. */
export function answerersOf(step: ApprovalStep): readonly ActorIdentity[] {
  return step.pool?.length ? step.pool : [step.approver];
}

/** The member of a stage a person is, if they are one. */
export function answererMatching(step: ApprovalStep, actor: ActorIdentity): ActorIdentity | undefined {
  return answerersOf(step).find((member) => isSamePerson(member, actor));
}

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
  /** One CISO approver, or the whole CISO team — any one of whom may answer. */
  ciso: ActorIdentity | readonly ActorIdentity[];
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
 * The CISO team: everyone the second stage is sent to.
 *
 * `CISO_APPROVER_EMAILS` lists them, comma-separated, each either a bare
 * address or `Name <address>`. Every member gets their own email and their own
 * single-use link; the first to answer decides, and every other member's link
 * dies in the same transaction.
 *
 * Who is NOT on this list matters as much as who is. The head of the CISO
 * function supervises the team rather than approving, and is kept out simply by
 * not being listed — nothing in this app hands them a link.
 *
 * Without the list, the single `CISO_APPROVER_EMAIL` still works as a team of
 * one, so an existing deployment keeps behaving exactly as before.
 */
export function resolveCisoTeam(): ActorIdentity[] {
  const raw = process.env.CISO_APPROVER_EMAILS?.trim();
  if (!raw) return [resolveCiso()];

  const team: ActorIdentity[] = [];
  for (const entry of raw.split(",")) {
    const text = entry.trim();
    if (!text) continue;

    const named = /^(.*?)<\s*([^<>\s]+)\s*>$/.exec(text);
    const email = (named ? named[2] : text).toLowerCase();
    const name = named?.[1].trim() || email;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Loud, not skipped: a mistyped member is a person who silently never
      // hears about anything, and nobody would notice until it mattered.
      throw new RoutingError(`CISO_APPROVER_EMAILS memuat alamat yang tidak sah: "${text}".`);
    }
    // The same person listed twice would get two links for one vote.
    if (!team.some((member) => member.email === email)) team.push({ name, email });
  }

  if (team.length === 0) {
    throw new RoutingError("CISO_APPROVER_EMAILS diisi tetapi tidak memuat satu alamat pun.");
  }
  return team;
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
 *   - A profile update routes to the current manager too. It cannot name a
 *     manager of its own — that field is not editable — so there is no
 *     destination to route to, and letting the request choose its approver
 *     would defeat having one.
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
  cisoTeam: readonly ActorIdentity[] = resolveCisoTeam(),
): ApproverRouting {
  return { manager: resolveManager(payload, employee), ciso: cisoTeam };
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
 * Refuses a routing where one person would wear two hats — and returns the CISO
 * team members who may answer this particular request.
 *
 * Two approvals only mean something if two different people give them. This is
 * checked at submit rather than at decision time so the request is refused
 * before anybody is emailed about it — discovering the clash halfway through
 * would leave a request that cannot legitimately be completed.
 *
 * For a team, a clash does not sink the request: the member who raised it, or
 * who is also its manager, is simply left out and never gets a link. Only when
 * nobody on the team is left is the request refused.
 */
export function assertSeparationOfDuties(
  requester: ActorIdentity,
  routing: ApproverRouting,
): ActorIdentity[] {
  if (isSamePerson(requester, routing.manager)) {
    throw new SeparationOfDutiesError(
      "Pemohon tidak boleh menjadi manager yang menyetujui pengajuannya sendiri.",
    );
  }

  const team: readonly ActorIdentity[] = Array.isArray(routing.ciso)
    ? routing.ciso
    : [routing.ciso as ActorIdentity];

  const isRequester = (member: ActorIdentity) => isSamePerson(requester, member);
  const isManager = (member: ActorIdentity) => isSamePerson(routing.manager, member);
  const eligible = team.filter((member) => !isRequester(member) && !isManager(member));

  if (eligible.length === 0) {
    throw new SeparationOfDutiesError(
      team.some(isRequester)
        ? "Pemohon tidak boleh menjadi approver CISO untuk pengajuannya sendiri."
        : "Manager dan CISO harus dua orang berbeda. Pilih manager lain untuk pengajuan ini.",
    );
  }
  return eligible;
}
