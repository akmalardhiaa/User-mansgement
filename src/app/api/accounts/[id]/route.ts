import {
  DuplicateAccountError,
  LastAdminError,
  deleteAccount,
  getAccount,
  updateAccount,
} from "@/lib/accounts/service";
import { requireAdmin, requireSelfOrAdmin } from "@/lib/auth/guard";
import { fail, ok, readJson } from "@/lib/http/apiResponse";
import { preflight, withCors } from "@/lib/http/cors";
import { parseUpdateUserInput } from "@/lib/validation/accountInput";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/**
 * GET /api/accounts/[id] — one account.
 *
 * Readable by an admin, or by the owner of the account. The id comes from the
 * URL and is therefore caller input; `requireSelfOrAdmin` compares it against
 * the id inside the verified token, which is the only one that means anything.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const { id } = await ctx.params;

  const guarded = await requireSelfOrAdmin(request, id);
  if (!guarded.ok) return withCors(guarded.response, request);

  try {
    const user = await getAccount(id);
    if (!user) return withCors(fail("Akun tidak ditemukan.", 404), request);
    return withCors(ok({ user }), request);
  } catch (error) {
    console.error("[accounts:get]", error);
    return withCors(fail("Gagal memuat akun.", 500), request);
  }
}

/**
 * PUT /api/accounts/[id] — update an account.
 *
 * A non-admin may edit their own name, email and password, but not their role:
 * without that check, any user could promote themselves to ADMIN with a single
 * request against their own account.
 */
export async function PUT(request: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const { id } = await ctx.params;

  const guarded = await requireSelfOrAdmin(request, id);
  if (!guarded.ok) return withCors(guarded.response, request);

  const parsed = parseUpdateUserInput(await readJson(request));
  if (!parsed.ok) {
    return withCors(fail("Perbaiki isian yang ditandai.", 422, { fieldErrors: parsed.errors }), request);
  }

  if (parsed.value.role !== undefined && guarded.user.role !== "ADMIN") {
    return withCors(fail("Hanya admin yang dapat mengubah peran.", 403, { code: "FORBIDDEN" }), request);
  }

  try {
    const user = await updateAccount(id, parsed.value);
    if (!user) return withCors(fail("Akun tidak ditemukan.", 404), request);

    return withCors(
      ok({
        user,
        message: user.emailVerified
          ? "Akun diperbarui."
          : "Akun diperbarui. Email baru perlu dikonfirmasi — tautan sudah dikirim.",
      }),
      request,
    );
  } catch (error) {
    if (error instanceof DuplicateAccountError) {
      return withCors(fail(error.message, 409, { fieldErrors: { email: error.message } }), request);
    }
    if (error instanceof LastAdminError) {
      return withCors(fail(error.message, 409, { code: "LAST_ADMIN" }), request);
    }

    console.error("[accounts:update]", error);
    return withCors(fail("Gagal memperbarui akun.", 500), request);
  }
}

/**
 * DELETE /api/accounts/[id] — remove an account. Admin only.
 *
 * Refuses to remove the last remaining admin: the check exists because the
 * alternative is a system nobody can administer, recoverable only by editing
 * the database by hand.
 */
export async function DELETE(request: Request, ctx: RouteContext<"/api/accounts/[id]">) {
  const { id } = await ctx.params;

  const guarded = await requireAdmin(request);
  if (!guarded.ok) return withCors(guarded.response, request);

  try {
    const deleted = await deleteAccount(id);
    if (!deleted) return withCors(fail("Akun tidak ditemukan.", 404), request);

    return withCors(ok({ deleted: true, id }), request);
  } catch (error) {
    if (error instanceof LastAdminError) {
      return withCors(fail(error.message, 409, { code: "LAST_ADMIN" }), request);
    }

    console.error("[accounts:delete]", error);
    return withCors(fail("Gagal menghapus akun.", 500), request);
  }
}
