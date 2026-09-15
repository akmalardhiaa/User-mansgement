import { DuplicateAccountError, createAccount, listAccounts } from "@/lib/accounts/service";
import { requireAdmin } from "@/lib/auth/guard";
import { isRole } from "@/lib/auth/types";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { parseCreateAccountInput } from "@/lib/validation/accountInput";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** Caps how much one request can pull, so a hand-written `take` cannot dump the table. */
const MAX_PAGE_SIZE = 200;

function positiveInt(value: string | null, fallback: number, max: number): number {
  // The absent case has to be handled before Number(): Number(null) is 0, not
  // NaN, so a missing ?take= would otherwise pass the integer check and cap the
  // page size at zero — an empty list next to a non-zero total.
  if (value === null || value.trim() === "") return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, max);
}

/**
 * GET /api/accounts — every login account. Admin only.
 *
 * This is the account list, not the HC employee roster: that one stays at
 * GET /api/users and is keyed by a different model entirely.
 */
export async function GET(request: Request) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return withCors(guarded.response, request);

  try {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");

    const { users, total } = await listAccounts({
      query: url.searchParams.get("q") ?? undefined,
      // An unrecognised role is ignored rather than rejected: a stray query
      // parameter should narrow nothing, not fail the whole request.
      role: isRole(role) ? role : undefined,
      take: positiveInt(url.searchParams.get("take"), 100, MAX_PAGE_SIZE),
      skip: positiveInt(url.searchParams.get("skip"), 0, Number.MAX_SAFE_INTEGER),
    });

    return withCors(ok({ users, total }), request);
  } catch (error) {
    console.error("[accounts:list]", error);
    return withCors(fail("Gagal memuat daftar akun.", 500), request);
  }
}

/**
 * POST /api/accounts — create an account that can sign in immediately. Admin only.
 *
 * For approvers: a manager or CISO needs an account whose email matches the
 * one written on a request, and then that request appears in their portal
 * inbox on its own.
 */
export async function POST(request: Request) {
  const guarded = await requireAdmin(request);
  if (!guarded.ok) return withCors(guarded.response, request);

  const parsed = parseCreateAccountInput(await readJson(request));
  if (!parsed.ok) {
    return withCors(fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors }), request);
  }

  try {
    return withCors(ok({ user: await createAccount(parsed.value) }, 201), request);
  } catch (error) {
    if (error instanceof DuplicateAccountError) {
      return withCors(fail(error.message, 409, { fieldErrors: { email: error.message } }), request);
    }
    console.error("[accounts:create]", error);
    return withCors(fail("Gagal membuat akun.", 500), request);
  }
}
