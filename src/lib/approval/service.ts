import type { ApprovalStatus, Prisma } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { getApprovalTokenTtlMs } from "@/lib/config/approvalEnv";
import { prisma } from "@/lib/db/prisma";
import type { ApprovingRole, RegisterWithApprovalInput } from "@/lib/validation/approvalInput";

import { sendAccountActive, sendCisoRequest, sendManagerRequest, sendRejection } from "./mailer";
import { createApprovalToken, hashApprovalToken, isWellFormedToken } from "./tokens";

/**
 * The account approval workflow: HC submits, the manager decides, the CISO
 * decides, the account activates.
 *
 * Every decision is claimed with a conditional update — "set MANAGER_APPROVED
 * where the status is still PENDING and the token is unused" — so two clicks
 * racing each other cannot both succeed. The loser matches zero rows and is
 * told the request was already decided.
 */

export class ApprovalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

const include = {
  user: { select: { id: true, email: true, fullName: true, department: true, emailVerified: true } },
} satisfies Prisma.UserApprovalRequestInclude;

type RequestWithUser = Prisma.UserApprovalRequestGetPayload<{ include: typeof include }>;

const ROLE_LABEL: Record<ApprovingRole, string> = {
  manager: "Manager",
  it_security: "CISO / IT Security",
};

function actorFor(request: RequestWithUser, role: ApprovingRole): string {
  return role === "manager"
    ? `${request.managerName} (${ROLE_LABEL.manager})`
    : `${request.cisoName} (${ROLE_LABEL.it_security})`;
}

type Db = Prisma.TransactionClient | typeof prisma;

function log(db: Db, approvalRequestId: string, action: string, actionBy: string, details?: string) {
  return db.approvalLog.create({ data: { approvalRequestId, action, actionBy, details } });
}

/** What leaves the API. Token hashes never do. */
export function toApprovalView(request: RequestWithUser) {
  return {
    id: request.id,
    status: request.status,
    employee: {
      id: request.user.id,
      fullName: request.user.fullName,
      email: request.user.email,
      department: request.department,
      active: request.user.emailVerified,
    },
    notes: request.notes,
    managerName: request.managerName,
    managerEmail: request.managerEmail,
    cisoName: request.cisoName,
    cisoEmail: request.cisoEmail,
    requesterName: request.requesterName,
    requesterEmail: request.requesterEmail,
    managerApprovedAt: request.managerApprovedAt?.toISOString() ?? null,
    cisoApprovedAt: request.cisoApprovedAt?.toISOString() ?? null,
    activatedAt: request.activatedAt?.toISOString() ?? null,
    rejectedAt: request.rejectedAt?.toISOString() ?? null,
    rejectedBy: request.rejectedBy,
    rejectionReason: request.rejectionReason,
    createdAt: request.createdAt.toISOString(),
    updatedAt: request.updatedAt.toISOString(),
  };
}

export type ApprovalView = ReturnType<typeof toApprovalView>;

/* -------------------------------------------------------------- submit */

export interface Requester {
  id: string;
  name: string;
  email: string;
}

export async function createApprovalRequest(input: RegisterWithApprovalInput, requester: Requester) {
  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new ApprovalError("Email sudah terdaftar.", 409, "EMAIL_TAKEN");
  }

  const token = createApprovalToken();
  const expiresAt = new Date(Date.now() + getApprovalTokenTtlMs());

  let request: RequestWithUser;
  try {
    request = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: input.email,
          fullName: input.fullName,
          password: await hashPassword(input.password),
          department: input.department,
          role: "USER",
          // Stays false until the CISO approves. Login refuses it until then.
          emailVerified: false,
        },
      });

      const created = await tx.userApprovalRequest.create({
        data: {
          userId: user.id,
          department: input.department,
          notes: input.notes,
          managerName: input.managerName,
          managerEmail: input.managerEmail,
          cisoName: input.cisoName,
          cisoEmail: input.cisoEmail,
          managerTokenHash: token.hash,
          managerTokenExpiresAt: expiresAt,
          requestedById: requester.id,
          requesterName: requester.name,
          requesterEmail: requester.email,
        },
        include,
      });

      await log(tx, created.id, "REQUEST_CREATED", `${requester.name} (HC)`, `Diajukan untuk ${user.email}`);
      return created;
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      throw new ApprovalError("Email sudah terdaftar.", 409, "EMAIL_TAKEN");
    }
    throw error;
  }

  const sent = await sendManagerRequest(request, token.raw);
  if (!sent.delivered) {
    // A request nobody was told about can never move. Remove it (the cascade
    // takes the request and its log with the user) so HC can simply resubmit.
    await prisma.user.delete({ where: { id: request.userId } });
    throw new ApprovalError(
      `Email ke manager (${request.managerEmail}) gagal dikirim, jadi pengajuan dibatalkan. Periksa konfigurasi email lalu coba lagi.`,
      502,
      "EMAIL_FAILED",
    );
  }

  await log(prisma, request.id, "MANAGER_NOTIFIED", "Sistem", `Email persetujuan dikirim ke ${request.managerEmail}`);
  return { requestId: request.id, status: request.status };
}

/* -------------------------------------------------------------- tokens */

export type TokenState = "actionable" | "used" | "expired" | "closed";

interface Resolved {
  request: RequestWithUser;
  role: ApprovingRole;
  state: TokenState;
  expiresAt: Date | null;
}

async function resolveToken(raw: string): Promise<Resolved> {
  if (!isWellFormedToken(raw)) {
    throw new ApprovalError("Tautan persetujuan tidak valid.", 400, "TOKEN_INVALID");
  }

  const hash = hashApprovalToken(raw);
  const request = await prisma.userApprovalRequest.findFirst({
    where: { OR: [{ managerTokenHash: hash }, { cisoTokenHash: hash }] },
    include,
  });
  if (!request) throw new ApprovalError("Tautan persetujuan tidak valid.", 404, "TOKEN_INVALID");

  // The role comes from which token matched — never from what the caller says.
  const role: ApprovingRole = request.managerTokenHash === hash ? "manager" : "it_security";
  const usedAt = role === "manager" ? request.managerTokenUsedAt : request.cisoTokenUsedAt;
  const expiresAt = role === "manager" ? request.managerTokenExpiresAt : request.cisoTokenExpiresAt;
  const expectedStatus: ApprovalStatus = role === "manager" ? "PENDING" : "MANAGER_APPROVED";

  const state: TokenState = usedAt
    ? "used"
    : request.status !== expectedStatus
      ? "closed"
      : !expiresAt || expiresAt.getTime() <= Date.now()
        ? "expired"
        : "actionable";

  return { request, role, state, expiresAt };
}

const STATE_ERROR: Record<Exclude<TokenState, "actionable">, [string, number, string]> = {
  used: ["Tautan ini sudah dipakai. Keputusan sudah tercatat.", 409, "TOKEN_USED"],
  expired: ["Tautan persetujuan sudah kedaluwarsa. Hubungi Human Capital.", 410, "TOKEN_EXPIRED"],
  closed: ["Permintaan ini tidak lagi menunggu keputusan Anda.", 409, "NOT_ACTIONABLE"],
};

async function requireActionable(raw: string, approvingRole: ApprovingRole): Promise<Resolved> {
  const resolved = await resolveToken(raw);
  if (resolved.role !== approvingRole) {
    throw new ApprovalError(
      "Tautan ini bukan untuk peran tersebut. Setiap peran punya tautan persetujuannya sendiri.",
      403,
      "ROLE_MISMATCH",
    );
  }
  if (resolved.state !== "actionable") {
    const [message, status, code] = STATE_ERROR[resolved.state];
    throw new ApprovalError(message, status, code);
  }
  return resolved;
}

export async function getApprovalByToken(raw: string) {
  const { request, role, state, expiresAt } = await resolveToken(raw);
  return {
    role,
    state,
    expiresAt: expiresAt?.toISOString() ?? null,
    request: toApprovalView(request),
  };
}

/* -------------------------------------------------------------- decide */

const notClaimed = () =>
  new ApprovalError("Permintaan ini sudah diputuskan sebelumnya.", 409, "ALREADY_DECIDED");

/** Decides through an emailed link. The role comes from the token. */
export async function approve(raw: string, approvingRole: ApprovingRole) {
  const { request, role } = await requireActionable(raw, approvingRole);
  return performApprove(request, role);
}

export async function reject(raw: string, approvingRole: ApprovingRole, reason: string) {
  const { request, role } = await requireActionable(raw, approvingRole);
  return performReject(request, role, reason);
}

/* ------------------------------------------------------ in-app decisions */

/**
 * Which step of `request` the signed-in person may decide, if any.
 *
 * Settled by the address on their account against the approver the request
 * names for its current step: the manager while PENDING, the CISO while
 * MANAGER_APPROVED. Nobody else — an ADMIN is not an approver unless the
 * request names them, so HC cannot approve its own submissions.
 */
function roleForUser(request: RequestWithUser, email: string): ApprovingRole | undefined {
  const me = email.trim().toLowerCase();
  if (request.status === "PENDING" && request.managerEmail.toLowerCase() === me) return "manager";
  if (request.status === "MANAGER_APPROVED" && request.cisoEmail.toLowerCase() === me) return "it_security";
  return undefined;
}

function myApprovalsWhere(email: string): Prisma.UserApprovalRequestWhereInput {
  const me = email.trim().toLowerCase();
  return {
    OR: [
      { status: "PENDING", managerEmail: { equals: me, mode: "insensitive" } },
      { status: "MANAGER_APPROVED", cisoEmail: { equals: me, mode: "insensitive" } },
    ],
  };
}

/** Requests waiting on the signed-in person, newest first. */
export async function listMyApprovals(email: string) {
  const rows = await prisma.userApprovalRequest.findMany({
    where: myApprovalsWhere(email),
    include,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({ ...toApprovalView(row), myRole: roleForUser(row, email)! }));
}

export function countMyApprovals(email: string) {
  return prisma.userApprovalRequest.count({ where: myApprovalsWhere(email) });
}

async function requireMine(requestId: string, email: string) {
  const request = await prisma.userApprovalRequest.findUnique({ where: { id: requestId }, include });
  if (!request) throw new ApprovalError("Pengajuan tidak ditemukan.", 404, "NOT_FOUND");
  const role = roleForUser(request, email);
  if (!role) {
    throw new ApprovalError("Pengajuan ini tidak sedang menunggu keputusan Anda.", 403, "NOT_YOUR_APPROVAL");
  }
  return { request, role };
}

/** Decides from the portal. The role comes from the signed-in account's address. */
export async function approveAsUser(requestId: string, email: string) {
  const { request, role } = await requireMine(requestId, email);
  return performApprove(request, role);
}

export async function rejectAsUser(requestId: string, email: string, reason: string) {
  const { request, role } = await requireMine(requestId, email);
  return performReject(request, role, reason);
}

/* ------------------------------------------------ shared decision logic */

/*
 * Both the emailed link and the portal end up here, so a decision means the
 * same thing — the same claim, the same audit entries, the same emails —
 * whichever way it was made. Deciding in the portal also spends the step's
 * token (the claim sets its used-at), so the emailed link dies with it.
 */
async function performApprove(request: RequestWithUser, role: ApprovingRole) {
  const actor = actorFor(request, role);
  const now = new Date();

  if (role === "manager") {
    const ciso = createApprovalToken();
    const claimed = await prisma.userApprovalRequest.updateMany({
      where: { id: request.id, status: "PENDING", managerTokenUsedAt: null },
      data: {
        status: "MANAGER_APPROVED",
        managerApprovedAt: now,
        managerTokenUsedAt: now,
        cisoTokenHash: ciso.hash,
        cisoTokenExpiresAt: new Date(now.getTime() + getApprovalTokenTtlMs()),
      },
    });
    if (claimed.count === 0) throw notClaimed();
    await log(prisma, request.id, "MANAGER_APPROVED", actor);

    const sent = await sendCisoRequest({ ...request, managerApprovedAt: now }, ciso.raw);
    if (!sent.delivered) {
      // Undo rather than strand the request behind an email nobody received.
      // The manager's link works again, so they can simply retry.
      await prisma.userApprovalRequest.update({
        where: { id: request.id },
        data: {
          status: "PENDING",
          managerApprovedAt: null,
          managerTokenUsedAt: null,
          cisoTokenHash: null,
          cisoTokenExpiresAt: null,
        },
      });
      await log(prisma, request.id, "CISO_NOTIFY_FAILED", "Sistem", sent.error);
      throw new ApprovalError(
        "Persetujuan belum tersimpan: email ke CISO gagal dikirim. Silakan coba lagi sebentar lagi.",
        502,
        "EMAIL_FAILED",
      );
    }

    await log(prisma, request.id, "CISO_NOTIFIED", "Sistem", `Email persetujuan dikirim ke ${request.cisoEmail}`);
    return {
      status: "MANAGER_APPROVED" as const,
      message: `Terima kasih. Permintaan diteruskan ke ${request.cisoName} (CISO / IT Security).`,
    };
  }

  const claimed = await prisma.userApprovalRequest.updateMany({
    where: { id: request.id, status: "MANAGER_APPROVED", cisoTokenUsedAt: null },
    data: { status: "IT_APPROVED", cisoApprovedAt: now, cisoTokenUsedAt: now },
  });
  if (claimed.count === 0) throw notClaimed();
  await log(prisma, request.id, "IT_APPROVED", actor);

  // Both approvals are in, so the account activates in the same step.
  if (!request.managerApprovedAt) {
    throw new ApprovalError("Persetujuan manager tidak ditemukan.", 409, "NOT_ACTIONABLE");
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: request.userId }, data: { emailVerified: true } }),
    prisma.userApprovalRequest.update({
      where: { id: request.id },
      data: { status: "ACTIVE", activatedAt: now },
    }),
    prisma.approvalLog.create({
      data: { approvalRequestId: request.id, action: "ACCOUNT_ACTIVATED", actionBy: "Sistem" },
    }),
  ]);

  // Activation stands even if this email fails: the approvals were real.
  const sent = await sendAccountActive(request);
  await log(
    prisma,
    request.id,
    sent.delivered ? "USER_NOTIFIED" : "USER_NOTIFY_FAILED",
    "Sistem",
    sent.delivered ? `Email aktivasi dikirim ke ${request.user.email}` : sent.error,
  );

  return { status: "ACTIVE" as const, message: `Akun ${request.user.fullName} sekarang aktif.` };
}

async function performReject(request: RequestWithUser, role: ApprovingRole, reason: string) {
  const actor = actorFor(request, role);
  const now = new Date();
  const status: ApprovalStatus = role === "manager" ? "MANAGER_REJECTED" : "IT_REJECTED";

  const claimed = await prisma.userApprovalRequest.updateMany({
    where:
      role === "manager"
        ? { id: request.id, status: "PENDING", managerTokenUsedAt: null }
        : { id: request.id, status: "MANAGER_APPROVED", cisoTokenUsedAt: null },
    data: {
      status,
      ...(role === "manager" ? { managerTokenUsedAt: now } : { cisoTokenUsedAt: now }),
      rejectedAt: now,
      rejectedBy: actor,
      rejectionReason: reason,
    },
  });
  if (claimed.count === 0) throw notClaimed();
  await log(prisma, request.id, status, actor, reason);

  const sent = await sendRejection(request, {
    byName: role === "manager" ? request.managerName : request.cisoName,
    byRole: ROLE_LABEL[role],
    reason,
    at: now,
  });
  await log(
    prisma,
    request.id,
    sent.delivered ? "REQUESTER_NOTIFIED" : "REQUESTER_NOTIFY_FAILED",
    "Sistem",
    sent.delivered ? `Email penolakan dikirim ke ${request.requesterEmail}` : sent.error,
  );

  return { status, message: "Penolakan tercatat dan Human Capital sudah diberi tahu." };
}

/* -------------------------------------------------------------- admin */

export async function listApprovals(options: { status?: ApprovalStatus; q?: string; take?: number; skip?: number }) {
  const q = options.q?.trim();
  const where: Prisma.UserApprovalRequestWhereInput = {
    ...(options.status ? { status: options.status } : {}),
    ...(q
      ? {
          OR: [
            { user: { fullName: { contains: q, mode: "insensitive" } } },
            { user: { email: { contains: q, mode: "insensitive" } } },
            { department: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.userApprovalRequest.findMany({
      where,
      include,
      orderBy: { createdAt: "desc" },
      take: options.take ?? 50,
      skip: options.skip ?? 0,
    }),
    prisma.userApprovalRequest.count({ where }),
    prisma.userApprovalRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) as Partial<
    Record<ApprovalStatus, number>
  >;

  return { requests: rows.map(toApprovalView), total, counts };
}

export async function getApprovalDetail(id: string) {
  const request = await prisma.userApprovalRequest.findUnique({
    where: { id },
    include: { ...include, logs: { orderBy: { timestamp: "asc" } } },
  });
  if (!request) return undefined;

  return {
    ...toApprovalView(request),
    logs: request.logs.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actionBy: entry.actionBy,
      details: entry.details,
      timestamp: entry.timestamp.toISOString(),
    })),
  };
}
