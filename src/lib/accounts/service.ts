import type { User } from "@prisma/client";

import { hashPassword, needsRehash, fakeVerifyPassword, verifyPassword } from "@/lib/auth/password";
import {
  EMAIL_TOKEN_TTL_MS,
  RESET_TOKEN_TTL_MS,
  createToken,
  expiryFromNow,
  isExpired,
} from "@/lib/auth/tokens";
import type { PublicUser, Role } from "@/lib/auth/types";
import { prisma } from "@/lib/db/prisma";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";

/**
 * Everything the account system does to the database.
 *
 * Route handlers stay thin on purpose: they parse input, call one of these,
 * and shape a response. The rules that must not vary between callers — an
 * unverified account cannot sign in, a reset token is single-use, the last
 * admin cannot be removed — live here, so there is one place to read them and
 * one place they can be wrong.
 */

/** Thrown when a second account claims an email that is already taken. */
export class DuplicateAccountError extends Error {
  constructor() {
    super("Email sudah terdaftar.");
    this.name = "DuplicateAccountError";
  }
}

/** Thrown when removing or demoting someone would leave the system with no admin. */
export class LastAdminError extends Error {
  constructor() {
    super("Ini satu-satunya admin. Angkat admin lain sebelum mengubah atau menghapus akun ini.");
    this.name = "LastAdminError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { code?: string }).code === "P2002"
  );
}

/** The only shape that may leave the API. Password and raw tokens never appear. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as Role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export type VerifyEmailOutcome =
  | { status: "verified"; user: PublicUser }
  | { status: "already-verified"; user: PublicUser }
  | { status: "invalid" }
  | { status: "expired" };

/**
 * Consumes a verification token.
 *
 * The token is cleared on success so the link cannot be replayed, and an
 * expired one is cleared too — leaving it in place would keep a dead value in
 * a unique column and block the address from being re-verified.
 */
export async function verifyEmailToken(token: string): Promise<VerifyEmailOutcome> {
  const user = await prisma.user.findUnique({ where: { emailVerificationToken: token } });

  if (!user) {
    // A token that is already spent looks identical to one that never existed.
    // Both are "invalid", which is the honest answer in either case.
    return { status: "invalid" };
  }

  if (user.emailVerified) return { status: "already-verified", user: toPublicUser(user) };

  if (isExpired(user.emailVerificationExpires)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerificationToken: null, emailVerificationExpires: null },
    });
    return { status: "expired" };
  }

  const verified = await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpires: null,
    },
  });

  return { status: "verified", user: toPublicUser(verified) };
}

/** Issues a fresh verification link, replacing any outstanding one. */
export async function resendVerification(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return false;

  const token = createToken();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerificationToken: token,
      emailVerificationExpires: expiryFromNow(EMAIL_TOKEN_TTL_MS),
    },
  });

  const { delivered } = await sendVerificationEmail(user, token);
  return delivered;
}

export type AuthOutcome =
  | { status: "ok"; user: User }
  | { status: "bad-credentials" }
  | { status: "unverified"; email: string }
  | { status: "pending-approval"; approvalStatus: string };

/**
 * Checks an email and password.
 *
 * An unknown address still pays the cost of a bcrypt comparison. Without that,
 * "no such account" answers in microseconds while a wrong password takes a
 * quarter of a second, and the difference alone maps out who is registered.
 */
export async function authenticate(email: string, password: string): Promise<AuthOutcome> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await fakeVerifyPassword();
    return { status: "bad-credentials" };
  }

  if (!(await verifyPassword(password, user.password))) {
    return { status: "bad-credentials" };
  }

  // An account created through the approval workflow stays locked until the
  // manager and the CISO have both approved it. Checked after the password for
  // the same reason as the verification check below: the answer must not
  // reveal anything to someone who only guessed an address.
  const approval = await prisma.userApprovalRequest.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  if (approval && approval.status !== "ACTIVE") {
    return { status: "pending-approval", approvalStatus: approval.status };
  }

  // Checked after the password, deliberately: answering "not verified" to
  // anyone who guesses an address would confirm the account exists.
  if (!user.emailVerified) return { status: "unverified", email: user.email };

  // Opportunistic upgrade when the cost factor has been raised since signup.
  // The plaintext is only in hand during login, so this is the one moment it
  // can be re-hashed without asking the person for it again.
  if (needsRehash(user.password)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(password) },
    });
  }

  return { status: "ok", user };
}

/**
 * Starts a password reset.
 *
 * Returns nothing about whether the address exists. The route says the same
 * thing either way, so the form cannot be used to test which emails have
 * accounts.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;

  const token = createToken();
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpires: expiryFromNow(RESET_TOKEN_TTL_MS) },
  });

  await sendPasswordResetEmail(user, token);
}

export type ResetOutcome = { status: "ok" } | { status: "invalid" } | { status: "expired" };

/**
 * Completes a password reset.
 *
 * Clearing the token makes the link single-use. It deliberately does not mark
 * the address verified: that flag is what activates an account, and only the
 * approval workflow may set it. A reset that also verified would let a pending
 * account unlock itself by asking for a password reset.
 */
export async function resetPassword(token: string, password: string): Promise<ResetOutcome> {
  const user = await prisma.user.findUnique({ where: { resetToken: token } });
  if (!user) return { status: "invalid" };

  if (isExpired(user.resetTokenExpires)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken: null, resetTokenExpires: null },
    });
    return { status: "expired" };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: await hashPassword(password),
      resetToken: null,
      resetTokenExpires: null,
    },
  });

  return { status: "ok" };
}

export interface ListOptions {
  /** Case-insensitive match against name or email. */
  query?: string;
  role?: Role;
  take?: number;
  skip?: number;
}

export async function listAccounts(options: ListOptions = {}): Promise<{
  users: PublicUser[];
  total: number;
}> {
  const query = options.query?.trim();
  const where = {
    ...(options.role ? { role: options.role } : {}),
    ...(query
      ? {
          OR: [
            { fullName: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: options.take ?? 100,
      skip: options.skip ?? 0,
    }),
    prisma.user.count({ where }),
  ]);

  return { users: users.map(toPublicUser), total };
}

export async function getAccount(id: string): Promise<PublicUser | undefined> {
  const user = await prisma.user.findUnique({ where: { id } });
  return user ? toPublicUser(user) : undefined;
}

export async function findByEmail(email: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { email } });
}

/** True when `id` is the only account left with the ADMIN role. */
async function isLastAdmin(id: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id }, select: { role: true } });
  if (user?.role !== "ADMIN") return false;
  return (await prisma.user.count({ where: { role: "ADMIN" } })) <= 1;
}

export interface UpdateAccountInput {
  fullName?: string;
  email?: string;
  role?: Role;
  password?: string;
}

/**
 * Applies a partial update.
 *
 * Changing the email clears verification and issues a fresh link: the new
 * address has not been proven yet, and leaving the flag set would let someone
 * move an account onto an address they do not control.
 */
export async function updateAccount(
  id: string,
  input: UpdateAccountInput,
): Promise<PublicUser | undefined> {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) return undefined;

  if (input.role && input.role !== "ADMIN" && (await isLastAdmin(id))) {
    throw new LastAdminError();
  }

  const emailChanged = Boolean(input.email && input.email !== existing.email);
  const token = emailChanged ? createToken() : undefined;

  let updated: User;
  try {
    updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.password !== undefined
          ? { password: await hashPassword(input.password) }
          : {}),
        ...(emailChanged
          ? {
              emailVerified: false,
              emailVerificationToken: token,
              emailVerificationExpires: expiryFromNow(EMAIL_TOKEN_TTL_MS),
            }
          : {}),
      },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateAccountError();
    throw error;
  }

  if (emailChanged && token) await sendVerificationEmail(updated, token);

  return toPublicUser(updated);
}

export async function deleteAccount(id: string): Promise<boolean> {
  if (await isLastAdmin(id)) throw new LastAdminError();

  try {
    await prisma.user.delete({ where: { id } });
    return true;
  } catch (error) {
    // P2025: the row was already gone. Deleting a missing record is the state
    // the caller asked for, but the route still reports 404 so a typo in the
    // id is not silently reported as a successful delete.
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2025") {
      return false;
    }
    throw error;
  }
}

/**
 * Creates an account that can sign in straight away.
 *
 * For people HC adds directly, such as the managers and CISO staff who decide
 * requests in the portal. They are not the subject of an approval, so nothing
 * stands between them and signing in: the admin creating them is the
 * authorisation.
 */
export async function createAccount(input: {
  email: string;
  fullName: string;
  password: string;
  role: Role;
}): Promise<PublicUser> {
  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        fullName: input.fullName,
        password: await hashPassword(input.password),
        role: input.role,
        emailVerified: true,
      },
    });
    return toPublicUser(user);
  } catch (error) {
    if (isUniqueViolation(error)) throw new DuplicateAccountError();
    throw error;
  }
}
